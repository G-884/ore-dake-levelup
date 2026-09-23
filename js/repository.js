/* =========================================================================
 * 俺だけレベルアップ / repository.js
 *
 * データアクセス層。アプリ内でデータを読み書きする唯一の窓口。
 * UI は localStorage を直接触らず、必ずここを経由する。
 *
 *   UI → Repository → Storage
 *
 * 起動時の流れ:
 *   読込 → schemaVersion確認 → (必要なら自動バックアップ→migration) → 正規化 → 保存
 *   どこかで失敗したら、元データには手を触れずにエラー状態を返す。
 * ========================================================================= */
(function (global) {
  'use strict';
  var ODL = global.ODL || (global.ODL = {});
  var U = ODL.Utils;
  var S = ODL.Schema;
  var St = ODL.Storage;
  var G = ODL.GameState;
  var C = ODL.Calculator;

  var data = null;
  var status = { state: 'unloaded' };
  var listeners = [];

  var Repo = ODL.Repository = {

    /* ---------------- 状態 ---------------- */
    get data() { return data; },
    get status() { return status; },
    isLoaded: function () { return !!data; },

    on: function (fn) { listeners.push(fn); return function () { Repo.off(fn); }; },
    off: function (fn) { listeners = listeners.filter(function (f) { return f !== fn; }); },
    emit: function (reason, payload) {
      listeners.slice().forEach(function (fn) {
        try { fn(reason, payload); } catch (e) { console.error(e); }
      });
    },

    /* ---------------- 自動バックアップ ---------------- */
    listAutoBackups: function () {
      return St.keys()
        .filter(function (k) { return k.indexOf(ODL.AUTO_BACKUP_PREFIX) === 0; })
        .sort()
        .reverse()
        .map(function (k) {
          return { key: k, at: k.slice(ODL.AUTO_BACKUP_PREFIX.length) };
        });
    },

    createAutoBackup: function (rawString, tag) {
      if (!rawString) return null;
      var stamp = new Date().toISOString().replace(/[:.]/g, '-') + (tag ? '_' + tag : '');
      var key = ODL.AUTO_BACKUP_PREFIX + stamp;
      try {
        St.writeRaw(key, rawString);
      } catch (e) {
        /* バックアップが取れなくても本体処理は続行する（ただし記録は残す） */
        console.warn('auto backup failed', e);
        return null;
      }
      /* 古いものを整理 */
      var all = Repo.listAutoBackups();
      all.slice(ODL.AUTO_BACKUP_KEEP).forEach(function (b) { St.remove(b.key); });
      return key;
    },

    readAutoBackup: function (key) {
      var raw = St.readRaw(key);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (e) { return null; }
    },

    /* ---------------- 読み込み ---------------- */
    load: function () {
      var res = St.readJson(ODL.STORAGE_KEY);

      /* 1) まだ何も保存されていない → 新規作成 */
      if (!res.found) {
        data = S.createEmptyData();
        Repo.refreshDerived();
        var w = Repo.persist('init');
        status = { state: w.ok ? 'new' : 'readonly', persistError: w.ok ? null : w.error };
        return status;
      }

      /* 2) JSONが壊れている → 絶対に上書きしない */
      if (res.error) {
        data = null;
        status = {
          state: 'corrupt',
          error: res.error,
          rawLength: res.raw ? res.raw.length : 0,
          backups: Repo.listAutoBackups()
        };
        return status;
      }

      var version = S.readVersion(res.data);
      var migrated = false, steps = [];

      /* 3) 必要なら migration。その前に必ず現状のバックアップを取る */
      if (version !== ODL.CURRENT_SCHEMA_VERSION) {
        var backupKey = null;
        try {
          backupKey = Repo.createAutoBackup(res.raw, 'premigration');
        } catch (e) { /* 続行 */ }

        var out;
        try {
          out = S.migrate(res.data);
        } catch (e) {
          /* migration失敗: 元データはそのまま。アプリは復旧画面を出す */
          data = null;
          status = {
            state: 'migration_failed',
            error: String(e && e.message || e),
            fromVersion: version,
            toVersion: ODL.CURRENT_SCHEMA_VERSION,
            backupKey: backupKey,
            backups: Repo.listAutoBackups()
          };
          return status;
        }
        migrated = out.migrated;
        steps = out.steps;
        res.data = out.data;
      }

      /* 4) 正規化して採用 */
      data = S.normalize(res.data);
      if (migrated) {
        data.meta.lastMigrationAt = U.nowIso();
      }
      Repo.refreshDerived();

      var wr = Repo.persist(migrated ? 'migration' : 'normalize');
      status = {
        state: wr.ok ? 'ok' : 'readonly',
        migrated: migrated,
        steps: steps,
        persistError: wr.ok ? null : wr.error
      };
      return status;
    },

    /* 壊れたデータを退避して新規スタート（ユーザーが明示的に選んだときだけ） */
    quarantineAndStartFresh: function () {
      var raw = St.readRaw(ODL.STORAGE_KEY);
      if (raw) Repo.createAutoBackup(raw, 'corrupt');
      data = S.createEmptyData();
      Repo.refreshDerived();
      var w = Repo.persist('fresh');
      status = { state: w.ok ? 'ok' : 'readonly', persistError: w.ok ? null : w.error };
      Repo.emit('reset');
      return status;
    },

    /* ---------------- 保存 ---------------- */
    persist: function (reason) {
      if (!data) return { ok: false, error: 'NO_DATA' };
      data.updatedAt = U.nowIso();
      data.appVersion = ODL.APP_VERSION;
      data.schemaVersion = ODL.CURRENT_SCHEMA_VERSION;
      var res = St.writeJson(ODL.STORAGE_KEY, data);
      if (!res.ok) {
        console.error('保存に失敗しました', res.error, reason);
      }
      return res;
    },

    save: function (reason) {
      var res = Repo.persist(reason);
      Repo.emit('change', { reason: reason, saveResult: res });
      return res;
    },

    /* 派生データ（PB）を記録から再計算する */
    refreshDerived: function () {
      if (!data) return;
      data.personalBests = G.pbsFromRecords(data.trainingRecords, data);
    },

    state: function (asOf) {
      return G.compute(data, asOf);
    },

    /* ---------------- トレーニング記録 ---------------- */
    addTrainingRecord: function (params) {
      var master = G.findMaster(data, params.activityId);
      if (!master) return { ok: false, errors: ['種目が見つかりません。'] };

      var v = C.validateInput(master, params.input);
      if (!v.ok) return { ok: false, errors: v.errors };

      var date = U.isDateStr(params.date) ? params.date : U.today();
      var now = U.nowIso();
      var pseudo = { id: null, date: date, createdAt: now };
      var snapshot = G.snapshotBefore(data, pseudo);

      var built = G.buildRecord(data, { activityId: master.activityId, date: date, input: params.input, note: params.note }, snapshot);
      if (built.load <= 0) return { ok: false, errors: ['入力値から負荷を計算できませんでした。'] };

      var streakInfo = built._streak;
      delete built._streak;
      delete built._master;

      var levelBefore = C.calculateLevel(
        U.sum(data.trainingRecords, function (r) { return r.exp; }), data.settings).level;

      var record = S.normalizeRecord(built);
      record.id = U.uuid();
      record.createdAt = now;
      record.updatedAt = now;

      data.trainingRecords.push(record);
      Repo.refreshDerived();
      var saveRes = Repo.save('add-record');

      var st = Repo.state();
      return {
        ok: true,
        record: record,
        master: master,
        streak: streakInfo,
        levelBefore: levelBefore,
        levelAfter: st.level,
        levelUp: st.level > levelBefore,
        state: st,
        saveResult: saveRes
      };
    },

    updateTrainingRecord: function (id, params) {
      var idx = -1;
      for (var i = 0; i < data.trainingRecords.length; i++) {
        if (data.trainingRecords[i].id === id) { idx = i; break; }
      }
      if (idx < 0) return { ok: false, errors: ['記録が見つかりません。'] };

      var old = data.trainingRecords[idx];
      var activityId = params.activityId || old.activityId;
      var master = G.findMaster(data, activityId);
      if (!master) return { ok: false, errors: ['種目が見つかりません。'] };

      var v = C.validateInput(master, params.input);
      if (!v.ok) return { ok: false, errors: v.errors };

      var date = U.isDateStr(params.date) ? params.date : old.date;
      /* 編集対象を一旦除いた状態で、その時点のスナップショットを取る */
      var without = data.trainingRecords.filter(function (r) { return r.id !== id; });
      var backup = data.trainingRecords;
      data.trainingRecords = without;
      var snapshot;
      try {
        snapshot = G.snapshotBefore(data, { id: id, date: date, createdAt: old.createdAt });
      } finally {
        data.trainingRecords = backup;
      }

      var built = G.buildRecord(data, {
        activityId: activityId, date: date, input: params.input,
        note: params.note !== undefined ? params.note : old.note
      }, snapshot);
      delete built._streak;
      delete built._master;

      var updated = S.normalizeRecord(built);
      updated.id = old.id;
      updated.createdAt = old.createdAt;
      updated.updatedAt = U.nowIso();

      data.trainingRecords[idx] = updated;
      Repo.refreshDerived();
      var saveRes = Repo.save('update-record');
      return { ok: true, record: updated, saveResult: saveRes };
    },

    deleteTrainingRecord: function (id) {
      var before = data.trainingRecords.length;
      data.trainingRecords = data.trainingRecords.filter(function (r) { return r.id !== id; });
      if (data.trainingRecords.length === before) return { ok: false, errors: ['記録が見つかりません。'] };
      Repo.refreshDerived();
      var saveRes = Repo.save('delete-record');
      return { ok: true, saveResult: saveRes };
    },

    /* 設定変更後などに、全記録を現在の計算式で計算し直す（上級者向け） */
    recalculateAllRecords: function () {
      var raw = St.readRaw(ODL.STORAGE_KEY);
      Repo.createAutoBackup(raw, 'recalc');

      var sorted = G.sortRecords(data.trainingRecords);
      var rebuilt = [];
      var working = { trainingRecords: [], activityMasters: data.activityMasters, settings: data.settings };
      var skipped = 0;

      sorted.forEach(function (r) {
        var master = G.findMaster(data, r.activityId);
        if (!master) { rebuilt.push(U.clone(r)); skipped++; return; }
        var snapshot = {
          stats: G.statsFromRecords(rebuilt, data.settings),
          pbs: G.pbsFromRecords(rebuilt, data),
          records: rebuilt,
          dates: rebuilt.map(function (x) { return x.date; })
        };
        var built = G.buildRecord(data, {
          activityId: r.activityId, date: r.date, input: r.input, note: r.note
        }, snapshot);
        delete built._streak;
        delete built._master;
        var next = S.normalizeRecord(built);
        next.id = r.id;
        next.createdAt = r.createdAt;
        next.updatedAt = U.nowIso();
        rebuilt.push(next);
      });

      data.trainingRecords = rebuilt;
      Repo.refreshDerived();
      var saveRes = Repo.save('recalculate');
      return { ok: true, count: rebuilt.length, skipped: skipped, saveResult: saveRes };
    },

    /* ---------------- 身体データ ---------------- */
    addBodyRecord: function (params) {
      var values = {};
      var any = false;
      Object.keys(params.values || {}).forEach(function (k) {
        var raw = params.values[k];
        if (raw === '' || raw === null || raw === undefined) return;
        var n = U.num(raw, NaN);
        if (!isFinite(n) || n <= 0) return;
        values[k] = U.round(n, 2);
        any = true;
      });
      if (!any) return { ok: false, errors: ['少なくとも1つの項目を入力してください。'] };

      var date = U.isDateStr(params.date) ? params.date : U.today();
      var rec = S.normalizeBodyRecord({
        id: params.id || U.uuid(), date: date, values: values,
        note: params.note, createdAt: U.nowIso()
      });

      if (params.id) {
        var found = false;
        data.bodyRecords = data.bodyRecords.map(function (r) {
          if (r.id !== params.id) return r;
          found = true;
          rec.createdAt = r.createdAt;
          rec.updatedAt = U.nowIso();
          return rec;
        });
        if (!found) data.bodyRecords.push(rec);
      } else {
        data.bodyRecords.push(rec);
      }
      var saveRes = Repo.save('body-record');
      return { ok: true, record: rec, saveResult: saveRes };
    },

    deleteBodyRecord: function (id) {
      var before = data.bodyRecords.length;
      data.bodyRecords = data.bodyRecords.filter(function (r) { return r.id !== id; });
      if (data.bodyRecords.length === before) return { ok: false, errors: ['記録が見つかりません。'] };
      var saveRes = Repo.save('delete-body-record');
      return { ok: true, saveResult: saveRes };
    },

    /* ---------------- マスタ ---------------- */
    upsertActivityMaster: function (master) {
      var norm = S.normalizeMaster(master, data.activityMasters.length);
      var errors = [];
      if (!norm.name) errors.push('種目名を入力してください。');
      if (!(norm.loadCoefficient > 0)) errors.push('負荷係数は0より大きい値にしてください。');
      if (!(norm.expCoefficient > 0)) errors.push('EXP係数は0より大きい値にしてください。');
      var allocTotal = 0;
      ODL.STATS.forEach(function (s) { allocTotal += U.num(norm.statAllocation[s], 0); });
      if (allocTotal <= 0) errors.push('ステータス配分を1つ以上設定してください。');
      if (errors.length) return { ok: false, errors: errors };

      var idx = -1;
      for (var i = 0; i < data.activityMasters.length; i++) {
        if (data.activityMasters[i].activityId === norm.activityId) { idx = i; break; }
      }
      if (idx >= 0) {
        norm.builtIn = data.activityMasters[idx].builtIn;
        data.activityMasters[idx] = norm;
      } else {
        data.activityMasters.push(norm);
      }
      data.activityMasters.sort(function (a, b) { return a.sortOrder - b.sortOrder; });
      var saveRes = Repo.save('master');
      return { ok: true, master: norm, saveResult: saveRes };
    },

    /* 種目は削除せず「無効化」する。過去の記録が参照しているため */
    setActivityActive: function (activityId, active) {
      data.activityMasters.forEach(function (m) {
        if (m.activityId === activityId) m.active = !!active;
      });
      var saveRes = Repo.save('master-active');
      return { ok: true, saveResult: saveRes };
    },

    deleteActivityMaster: function (activityId) {
      var used = data.trainingRecords.some(function (r) { return r.activityId === activityId; });
      if (used) {
        return { ok: false, errors: ['この種目には記録があるため削除できません。「無効にする」を使ってください。'] };
      }
      data.activityMasters = data.activityMasters.filter(function (m) { return m.activityId !== activityId; });
      var saveRes = Repo.save('master-delete');
      return { ok: true, saveResult: saveRes };
    },

    upsertBodyMetric: function (metric) {
      var norm = S.normalizeMetric(metric, data.bodyMetrics.length);
      if (!norm.name) return { ok: false, errors: ['項目名を入力してください。'] };
      var idx = -1;
      for (var i = 0; i < data.bodyMetrics.length; i++) {
        if (data.bodyMetrics[i].metricId === norm.metricId) { idx = i; break; }
      }
      if (idx >= 0) { norm.builtIn = data.bodyMetrics[idx].builtIn; data.bodyMetrics[idx] = norm; }
      else data.bodyMetrics.push(norm);
      data.bodyMetrics.sort(function (a, b) { return a.sortOrder - b.sortOrder; });
      var saveRes = Repo.save('metric');
      return { ok: true, metric: norm, saveResult: saveRes };
    },

    /* ---------------- 設定 ---------------- */
    updateSettings: function (patch) {
      data.settings = U.mergeDefaults(
        U.mergeDefaults(patch, data.settings), ODL.DEFAULT_SETTINGS);
      if (patch && patch.streak && Array.isArray(patch.streak.bonusTable)) {
        data.settings.streak.bonusTable = patch.streak.bonusTable
          .map(function (b) { return { days: U.num(b.days, 0), rate: U.num(b.rate, 0) }; })
          .filter(function (b) { return b.days > 0; })
          .sort(function (a, b) { return a.days - b.days; });
      }
      var saveRes = Repo.save('settings');
      return { ok: true, saveResult: saveRes };
    },

    updateProfile: function (patch) {
      data.userProfile = U.mergeDefaults(patch, data.userProfile);
      var saveRes = Repo.save('profile');
      return { ok: true, saveResult: saveRes };
    },

    resetSettingsToDefault: function () {
      data.settings = U.clone(ODL.DEFAULT_SETTINGS);
      return Repo.save('settings-reset');
    },

    /* ---------------- バックアップ / 復元 ---------------- */
    exportObject: function () {
      var out = U.clone(data);
      out.exportedAt = U.nowIso();
      out.exportedBy = ODL.APP_NAME + ' v' + ODL.APP_VERSION;
      return out;
    },

    exportString: function () {
      return JSON.stringify(Repo.exportObject(), null, 2);
    },

    backupFileName: function () {
      return ODL.BACKUP_FILE_PREFIX + U.today() + '.json';
    },

    markBackedUp: function () {
      data.meta.lastBackupAt = U.nowIso();
      Repo.save('backup-mark');
    },

    /* JSON文字列から復元。現在のデータは事前に自動バックアップする */
    importFromString: function (text, options) {
      options = options || {};
      var parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        return { ok: false, errors: ['ファイルがJSONとして読み込めませんでした。バックアップファイルを選び直してください。'] };
      }

      var check = S.validateImport(parsed);
      if (!check.ok) return { ok: false, errors: check.errors };

      var migrated;
      try {
        migrated = S.migrate(parsed);
      } catch (e) {
        var msg = String(e && e.message || e);
        if (msg.indexOf('SCHEMA_VERSION_TOO_NEW') === 0) {
          return { ok: false, errors: ['このバックアップは、より新しいバージョンのアプリで作られています。アプリを更新してから読み込んでください。'] };
        }
        return { ok: false, errors: ['データの変換に失敗しました。現在のデータは変更していません。（' + msg + '）'] };
      }

      var normalized;
      try {
        normalized = S.normalize(migrated.data);
      } catch (e) {
        return { ok: false, errors: ['データの形式を確認できませんでした。現在のデータは変更していません。'] };
      }

      if (!normalized.trainingRecords.length && !normalized.bodyRecords.length && !options.allowEmpty) {
        return {
          ok: false, needsConfirmEmpty: true,
          errors: ['このバックアップにはトレーニング記録が1件も入っていません。本当に復元しますか？']
        };
      }

      /* 上書き前に必ず現在のデータを自動バックアップ */
      var raw = St.readRaw(ODL.STORAGE_KEY);
      var backupKey = Repo.createAutoBackup(raw, 'preimport');

      var prev = data;
      data = normalized;
      Repo.refreshDerived();
      var saveRes = Repo.persist('import');
      if (!saveRes.ok) {
        data = prev;  /* 保存できなかったら元に戻す */
        return { ok: false, errors: ['復元したデータを保存できませんでした。空き容量を確認してください。現在のデータはそのままです。'] };
      }
      Repo.emit('change', { reason: 'import' });

      return {
        ok: true,
        migrated: migrated.migrated,
        steps: migrated.steps,
        backupKey: backupKey,
        counts: {
          training: normalized.trainingRecords.length,
          body: normalized.bodyRecords.length,
          masters: normalized.activityMasters.length
        }
      };
    },

    restoreAutoBackup: function (key) {
      var raw = St.readRaw(key);
      if (!raw) return { ok: false, errors: ['バックアップが見つかりません。'] };
      return Repo.importFromString(raw, { allowEmpty: true });
    },

    /* ---------------- 初期化 ---------------- */
    resetAll: function (keepMasters) {
      var raw = St.readRaw(ODL.STORAGE_KEY);
      Repo.createAutoBackup(raw, 'reset');
      var fresh = S.createEmptyData();
      if (keepMasters && data) {
        fresh.activityMasters = U.clone(data.activityMasters);
        fresh.bodyMetrics = U.clone(data.bodyMetrics);
        fresh.settings = U.clone(data.settings);
      }
      data = fresh;
      Repo.refreshDerived();
      var saveRes = Repo.persist('reset');
      Repo.emit('change', { reason: 'reset' });
      return { ok: saveRes.ok, saveResult: saveRes };
    }
  };

})(typeof window !== 'undefined' ? window : globalThis);
