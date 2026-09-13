/* =========================================================================
 * 俺だけレベルアップ / schema.js
 *
 * 保存データの「形」と、バージョン間の migration を担当する。
 *
 * 設計方針（最重要）
 *  - 保存データには必ず schemaVersion を持たせる
 *  - 起動時・復元時に schemaVersion を確認し、古ければ自動で migration する
 *  - migration は「変換」であり「作り直し」ではない。過去の記録は必ず引き継ぐ
 *  - migration に失敗したら、元データには一切手を触れない（例外を投げて中断）
 *  - 未来のバージョン（アプリより新しいデータ）は読み込まず、明示的に拒否する
 * ========================================================================= */
(function (global) {
  'use strict';
  var ODL = global.ODL || (global.ODL = {});
  var U = ODL.Utils;
  var S = ODL.Schema = {};

  /* ---------------------------------------------------------------------
   * 空データの生成
   * ------------------------------------------------------------------- */
  S.createEmptyData = function () {
    var now = U.nowIso();
    return {
      schemaVersion: ODL.CURRENT_SCHEMA_VERSION,
      appVersion: ODL.APP_VERSION,
      createdAt: now,
      updatedAt: now,
      userProfile: {
        nickname: '',
        startDate: U.today()
      },
      settings: U.clone(ODL.DEFAULT_SETTINGS),
      activityMasters: U.clone(ODL.DEFAULT_ACTIVITY_MASTERS),
      bodyMetrics: U.clone(ODL.DEFAULT_BODY_METRICS),
      trainingRecords: [],
      bodyRecords: [],
      /* personalBests は trainingRecords から再計算できる派生データだが、
         指示書のデータ設計に合わせて保存もする（読み込み時に必ず再計算する） */
      personalBests: {},
      meta: {
        lastBackupAt: null,
        lastMigrationAt: null
      }
    };
  };

  /* ---------------------------------------------------------------------
   * migration 定義
   *   キー n の関数は「バージョン n のデータを n+1 にする」
   *   例: MIGRATIONS[1] = v1 -> v2
   *
   *   0 は「schemaVersion を持たない、あるいは 0 の古い保存形式」を表す。
   *   将来 v2 を作るときは MIGRATIONS[1] を追加し、
   *   ODL.CURRENT_SCHEMA_VERSION を 2 にするだけでよい。
   * ------------------------------------------------------------------- */
  S.MIGRATIONS = {
    /* v0 (schemaVersion なし / 0) -> v1
       初期プロトタイプ形式の受け皿。記録は必ず引き継ぐ。 */
    0: function (data) {
      var d = U.clone(data) || {};
      var base = S.createEmptyData();

      /* 旧形式では records / history などに記録が入っていた可能性がある */
      var legacyRecords = d.trainingRecords || d.records || d.history || [];
      var legacyBody = d.bodyRecords || d.body || d.measurements || [];

      d.trainingRecords = Array.isArray(legacyRecords) ? legacyRecords : [];
      d.bodyRecords = Array.isArray(legacyBody) ? legacyBody : [];
      d.settings = U.mergeDefaults(d.settings, base.settings);
      d.activityMasters = (Array.isArray(d.activityMasters) && d.activityMasters.length)
        ? d.activityMasters : base.activityMasters;
      d.bodyMetrics = (Array.isArray(d.bodyMetrics) && d.bodyMetrics.length)
        ? d.bodyMetrics : base.bodyMetrics;
      d.userProfile = U.mergeDefaults(d.userProfile, base.userProfile);
      d.meta = U.mergeDefaults(d.meta, base.meta);
      d.personalBests = U.isPlainObject(d.personalBests) ? d.personalBests : {};
      d.schemaVersion = 1;
      return d;
    }
  };

  /* ---------------------------------------------------------------------
   * migration 実行
   *   - 入力データは変更しない（clone して進める）
   *   - 途中で失敗したら例外を投げる。呼び出し側が元データを保護する
   * ------------------------------------------------------------------- */
  S.needsMigration = function (data) {
    var v = S.readVersion(data);
    return v < ODL.CURRENT_SCHEMA_VERSION;
  };

  S.readVersion = function (data) {
    if (!U.isPlainObject(data)) return -1;
    var v = data.schemaVersion;
    if (v === undefined || v === null) return 0;      /* 旧形式扱い */
    var n = parseInt(v, 10);
    return isFinite(n) ? n : -1;
  };

  S.migrate = function (rawData) {
    var version = S.readVersion(rawData);
    if (version < 0) {
      throw new Error('SCHEMA_VERSION_INVALID');
    }
    if (version > ODL.CURRENT_SCHEMA_VERSION) {
      /* アプリより新しいデータ。読み込むと壊す可能性があるので拒否する */
      throw new Error('SCHEMA_VERSION_TOO_NEW');
    }

    var data = U.clone(rawData);
    var steps = [];
    var guard = 0;

    while (version < ODL.CURRENT_SCHEMA_VERSION) {
      if (++guard > 100) throw new Error('MIGRATION_LOOP');
      var fn = S.MIGRATIONS[version];
      if (typeof fn !== 'function') {
        throw new Error('MIGRATION_MISSING:' + version + '->' + (version + 1));
      }
      var before = version;
      var next = fn(data);
      if (!U.isPlainObject(next)) throw new Error('MIGRATION_FAILED:' + before);
      var newVersion = S.readVersion(next);
      if (newVersion <= before) throw new Error('MIGRATION_NO_PROGRESS:' + before);
      data = next;
      version = newVersion;
      steps.push(before + '→' + version);
    }

    return { data: data, migrated: steps.length > 0, steps: steps };
  };

  /* ---------------------------------------------------------------------
   * 正規化
   *   読み込んだデータに欠損があってもアプリが落ちないように形を整える。
   *   「壊れているから初期化する」ことは絶対にしない。拾えるものは拾う。
   * ------------------------------------------------------------------- */
  function normalizeAllocation(alloc) {
    var out = {};
    ODL.STATS.forEach(function (s) { out[s] = U.clamp(U.num(alloc && alloc[s], 0), 0, 1000); });
    return out;
  }

  S.normalizeMaster = function (m, index) {
    var base = {
      activityId: '', name: '', shortName: '', icon: '🏋️',
      category: 'strength', inputType: 'reps', unit: '回',
      loadCoefficient: 1, expCoefficient: 1,
      statAllocation: { STR: 0, VIT: 0, END: 0, AGI: 0, DEX: 0 },
      quickValues: [], active: true, sortOrder: 100, builtIn: false
    };
    var o = U.mergeDefaults(m, base);
    o.activityId = String(o.activityId || U.slugId('activity'));
    o.name = String(o.name || o.activityId);
    o.shortName = String(o.shortName || o.name);
    if (!ODL.INPUT_TYPES[o.inputType]) o.inputType = 'reps';
    if (!ODL.CATEGORIES[o.category]) o.category = 'strength';
    o.loadCoefficient = U.num(o.loadCoefficient, 1);
    o.expCoefficient = U.num(o.expCoefficient, 1);
    o.statAllocation = normalizeAllocation(o.statAllocation);
    o.quickValues = Array.isArray(o.quickValues)
      ? o.quickValues.map(function (v) { return U.num(v, 0); }).filter(function (v) { return v > 0; })
      : [];
    o.active = o.active !== false;
    o.sortOrder = U.num(o.sortOrder, (index + 1) * 10);
    return o;
  };

  S.normalizeRecord = function (r) {
    if (!U.isPlainObject(r)) return null;
    var rec = {
      id: r.id ? String(r.id) : U.uuid(),
      date: U.isDateStr(r.date) ? r.date : (U.toDateStr(r.date) || U.today()),
      activityId: String(r.activityId || r.activity || ''),
      input: U.isPlainObject(r.input) ? r.input : {},
      value: U.num(r.value, 0),
      unit: String(r.unit || ''),
      load: U.num(r.load, 0),
      exp: U.num(r.exp, 0),
      expBreakdown: U.isPlainObject(r.expBreakdown) ? r.expBreakdown : {},
      statGrowth: {},
      isPersonalBest: !!r.isPersonalBest,
      note: typeof r.note === 'string' ? r.note : '',
      calcVersion: U.num(r.calcVersion, 0),
      createdAt: r.createdAt || U.nowIso(),
      updatedAt: r.updatedAt || r.createdAt || U.nowIso()
    };
    ODL.STATS.forEach(function (s) {
      rec.statGrowth[s] = U.num(r.statGrowth && r.statGrowth[s], 0);
    });
    /* 旧データで input が無い場合、value から復元を試みる */
    if (!Object.keys(rec.input).length && rec.value > 0) {
      rec.input = { reps: rec.value };
    }
    return rec.activityId ? rec : null;
  };

  S.normalizeBodyRecord = function (r) {
    if (!U.isPlainObject(r)) return null;
    var values = {};
    if (U.isPlainObject(r.values)) {
      Object.keys(r.values).forEach(function (k) {
        var v = r.values[k];
        if (v === '' || v === null || v === undefined) return;
        var n = U.num(v, NaN);
        if (isFinite(n)) values[k] = n;
      });
    }
    return {
      id: r.id ? String(r.id) : U.uuid(),
      date: U.isDateStr(r.date) ? r.date : (U.toDateStr(r.date) || U.today()),
      values: values,
      note: typeof r.note === 'string' ? r.note : '',
      createdAt: r.createdAt || U.nowIso(),
      updatedAt: r.updatedAt || r.createdAt || U.nowIso()
    };
  };

  S.normalizeMetric = function (m, index) {
    var base = { metricId: '', name: '', unit: '', step: 0.1, active: true, sortOrder: 100, builtIn: false };
    var o = U.mergeDefaults(m, base);
    o.metricId = String(o.metricId || U.slugId('metric'));
    o.name = String(o.name || o.metricId);
    o.unit = String(o.unit || '');
    o.step = U.num(o.step, 0.1) || 0.1;
    o.active = o.active !== false;
    o.sortOrder = U.num(o.sortOrder, (index + 1) * 10);
    return o;
  };

  S.normalize = function (data) {
    var base = S.createEmptyData();
    var d = U.isPlainObject(data) ? U.clone(data) : {};

    var out = {
      schemaVersion: ODL.CURRENT_SCHEMA_VERSION,
      appVersion: ODL.APP_VERSION,
      createdAt: d.createdAt || base.createdAt,
      updatedAt: d.updatedAt || base.updatedAt,
      userProfile: U.mergeDefaults(d.userProfile, base.userProfile),
      settings: U.mergeDefaults(d.settings, base.settings),
      activityMasters: [],
      bodyMetrics: [],
      trainingRecords: [],
      bodyRecords: [],
      personalBests: {},
      meta: U.mergeDefaults(d.meta, base.meta)
    };

    /* ストリークボーナス表は配列なので mergeDefaults の対象外として個別処理 */
    if (Array.isArray(d.settings && d.settings.streak && d.settings.streak.bonusTable)) {
      out.settings.streak.bonusTable = d.settings.streak.bonusTable
        .map(function (b) { return { days: U.num(b.days, 0), rate: U.num(b.rate, 0) }; })
        .filter(function (b) { return b.days > 0; })
        .sort(function (a, b) { return a.days - b.days; });
    }

    var masters = Array.isArray(d.activityMasters) && d.activityMasters.length
      ? d.activityMasters : base.activityMasters;
    var seen = {};
    masters.forEach(function (m, i) {
      var nm = S.normalizeMaster(m, i);
      if (seen[nm.activityId]) return;
      seen[nm.activityId] = true;
      out.activityMasters.push(nm);
    });

    var metrics = Array.isArray(d.bodyMetrics) && d.bodyMetrics.length
      ? d.bodyMetrics : base.bodyMetrics;
    var seenM = {};
    metrics.forEach(function (m, i) {
      var nm = S.normalizeMetric(m, i);
      if (seenM[nm.metricId]) return;
      seenM[nm.metricId] = true;
      out.bodyMetrics.push(nm);
    });

    var seenR = {};
    (Array.isArray(d.trainingRecords) ? d.trainingRecords : []).forEach(function (r) {
      var nr = S.normalizeRecord(r);
      if (!nr) return;
      if (seenR[nr.id]) nr.id = U.uuid();
      seenR[nr.id] = true;
      out.trainingRecords.push(nr);
    });

    var seenB = {};
    (Array.isArray(d.bodyRecords) ? d.bodyRecords : []).forEach(function (r) {
      var nr = S.normalizeBodyRecord(r);
      if (!nr) return;
      if (seenB[nr.id]) nr.id = U.uuid();
      seenB[nr.id] = true;
      out.bodyRecords.push(nr);
    });

    return out;
  };

  /* ---------------------------------------------------------------------
   * バックアップJSONの妥当性チェック
   * ------------------------------------------------------------------- */
  S.validateImport = function (obj) {
    var errors = [];
    if (!U.isPlainObject(obj)) {
      errors.push('JSONの中身がオブジェクトではありません。');
      return { ok: false, errors: errors };
    }
    var v = S.readVersion(obj);
    if (v < 0) errors.push('schemaVersion が不正です。');
    if (v > ODL.CURRENT_SCHEMA_VERSION) {
      errors.push('このバックアップは新しいバージョンのアプリで作られています（schemaVersion ' +
        v + '）。アプリを更新してから読み込んでください。');
    }
    if (!Array.isArray(obj.trainingRecords) && !Array.isArray(obj.records)) {
      errors.push('トレーニング記録の配列が見つかりません。');
    }
    return { ok: errors.length === 0, errors: errors, version: v };
  };

})(typeof window !== 'undefined' ? window : globalThis);
