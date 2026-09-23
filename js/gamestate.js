/* =========================================================================
 * 俺だけレベルアップ / gamestate.js
 *
 * ゲーム状態（Lv・EXP・ステータス・ストリーク・PB）は
 * 「すべて trainingRecords から再計算できる」構造にしてある。
 * 累積値を単独で持って記録と矛盾する、という事態を避けるため。
 *
 * 各記録には計算時点の load / exp / statGrowth が焼き込まれているので、
 * あとから計算式を変えても過去の記録の値は勝手に変わらない。
 * ここでやるのはその「集計」だけ。
 * ========================================================================= */
(function (global) {
  'use strict';
  var ODL = global.ODL || (global.ODL = {});
  var U = ODL.Utils;
  var C = ODL.Calculator;
  var G = ODL.GameState = {};

  /* 記録を時系列に並べる（同日内は作成順） */
  G.sortRecords = function (records) {
    return (records || []).slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      var ca = String(a.createdAt || ''), cb = String(b.createdAt || '');
      if (ca !== cb) return ca < cb ? -1 : 1;
      return String(a.id) < String(b.id) ? -1 : 1;
    });
  };

  G.masterMap = function (data) {
    var map = {};
    (data.activityMasters || []).forEach(function (m) { map[m.activityId] = m; });
    return map;
  };

  G.findMaster = function (data, activityId) {
    var list = data.activityMasters || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].activityId === activityId) return list[i];
    }
    return null;
  };

  /* 記録集合からステータス合計を求める */
  G.statsFromRecords = function (records, settings) {
    var init = U.num(settings.growth.initialStat, 10);
    var stats = {};
    ODL.STATS.forEach(function (s) { stats[s] = init; });
    (records || []).forEach(function (r) {
      ODL.STATS.forEach(function (s) {
        stats[s] += U.num(r.statGrowth && r.statGrowth[s], 0);
      });
    });
    ODL.STATS.forEach(function (s) { stats[s] = U.round(stats[s], 4); });
    return stats;
  };

  /* 記録集合からPB表を求める。
     種目ごとに、指標（最高回数 / 最長距離 / ベストペース …）それぞれの最高記録を持つ。 */
  G.pbsFromRecords = function (records, data) {
    var masters = G.masterMap(data);
    var byActivity = {};
    G.sortRecords(records).forEach(function (r) {
      if (!masters[r.activityId]) return;
      (byActivity[r.activityId] = byActivity[r.activityId] || []).push(r);
    });

    var pbs = {};
    Object.keys(byActivity).forEach(function (activityId) {
      var master = masters[activityId];
      var list = byActivity[activityId];
      var metrics = {};

      C.pbMetrics(master).forEach(function (def) {
        var bestValue = null, bestRecord = null;
        list.forEach(function (r) {
          var v = C.pbMetricValue(master, r.input || {}, def.key);
          if (v === null) return;
          var better = (bestValue === null) ||
            (def.direction === 'min' ? v < bestValue - 1e-9 : v > bestValue + 1e-9);
          if (better) { bestValue = v; bestRecord = r; }
        });
        if (bestRecord === null) return;
        metrics[def.key] = {
          key: def.key,
          label: def.label,
          primary: !!def.primary,
          value: U.round(bestValue, 6),
          text: C.pbMetricText(master, bestRecord.input || {}, def.key),
          recordId: bestRecord.id,
          date: bestRecord.date,
          input: U.clone(bestRecord.input || {})
        };
      });

      var primary = metrics[C.primaryPbMetric(master).key];
      if (!primary) return;

      pbs[activityId] = {
        activityId: activityId,
        /* 代表指標。既存の表示・集計はこちらを見る */
        value: primary.value,
        label: primary.text,
        recordId: primary.recordId,
        date: primary.date,
        input: primary.input,
        metrics: metrics
      };
    });
    return pbs;
  };

  /* 指定した記録より「前」の時点のステータス・PB（編集時の再計算に使う） */
  G.snapshotBefore = function (data, record) {
    var sorted = G.sortRecords(data.trainingRecords);
    var before = [];
    for (var i = 0; i < sorted.length; i++) {
      var r = sorted[i];
      if (record && r.id === record.id) break;
      if (record && !G.isBefore(r, record)) break;
      before.push(r);
    }
    return {
      stats: G.statsFromRecords(before, data.settings),
      pbs: G.pbsFromRecords(before, data),
      records: before,
      dates: before.map(function (r) { return r.date; })
    };
  };

  G.isBefore = function (a, b) {
    if (a.date !== b.date) return a.date < b.date;
    return String(a.createdAt || '') <= String(b.createdAt || '');
  };

  /* ---------------------------------------------------------------------
   * 現在のゲーム状態をまとめて計算
   * ------------------------------------------------------------------- */
  G.compute = function (data, asOfDate) {
    var settings = data.settings;
    var records = data.trainingRecords || [];
    var asOf = U.isDateStr(asOfDate) ? asOfDate : U.today();

    var cumulativeExp = U.round(U.sum(records, function (r) { return r.exp; }), 2);
    var levelInfo = C.calculateLevel(cumulativeExp, settings);
    var stats = G.statsFromRecords(records, settings);
    var pbs = G.pbsFromRecords(records, data);
    var streak = C.calculateStreak(
      records.map(function (r) { return r.date; }), settings, asOf);

    var dateSet = {};
    records.forEach(function (r) { dateSet[r.date] = (dateSet[r.date] || 0) + 1; });

    var monthKey = U.monthKey(asOf);
    var monthRecords = records.filter(function (r) { return U.monthKey(r.date) === monthKey; });
    var monthDays = {};
    monthRecords.forEach(function (r) { monthDays[r.date] = true; });

    var todayRecords = G.sortRecords(records.filter(function (r) { return r.date === asOf; }));

    return {
      asOf: asOf,
      cumulativeExp: cumulativeExp,
      level: levelInfo.level,
      levelInfo: levelInfo,
      stats: stats,
      streak: streak,
      pbs: pbs,
      totalRecords: records.length,
      totalLoad: U.round(U.sum(records, function (r) { return r.load; }), 2),
      totalDays: Object.keys(dateSet).length,
      dateCounts: dateSet,
      monthRecordCount: monthRecords.length,
      monthDayCount: Object.keys(monthDays).length,
      todayRecords: todayRecords,
      todayExp: U.round(U.sum(todayRecords, function (r) { return r.exp; }), 2)
    };
  };

  /* ---------------------------------------------------------------------
   * 記録1件を計算して「確定」させる
   *   snapshot: その記録の直前時点のステータス・PB・記録日一覧
   * ------------------------------------------------------------------- */
  G.buildRecord = function (data, params, snapshot) {
    var master = G.findMaster(data, params.activityId);
    if (!master) throw new Error('ACTIVITY_NOT_FOUND');

    var settings = data.settings;
    var input = {};
    var fields = (ODL.INPUT_TYPES[master.inputType] || ODL.INPUT_TYPES.reps).fields;
    fields.forEach(function (f) {
      var v = params.input ? params.input[f] : undefined;
      if (v === '' || v === null || v === undefined) return;
      input[f] = U.num(v, 0);
    });

    var loadRes = C.calculateLoad(master, input, settings);

    /* PB判定は「この記録より前の、同じ種目の記録」すべてと比較する */
    var priorSameActivity = (snapshot.records || []).filter(function (r) {
      return r.activityId === master.activityId;
    });
    var pbEval = C.evaluatePersonalBest(master, input, priorSameActivity, settings);
    var isPb = pbEval.isPb;
    var currentPb = snapshot.pbs[master.activityId] || null;

    /* ストリークはこの記録の日付時点で、この記録自身も含めて評価する */
    var dates = snapshot.dates.slice();
    dates.push(params.date);
    var streak = C.calculateStreak(dates, settings, params.date);

    var expRes = C.calculateExp(loadRes.load, master, settings, {
      streakDays: streak.current,
      isPersonalBest: isPb
    });

    var statGrowth = C.calculateStatGrowth(loadRes.load, master, snapshot.stats, settings);

    var breakdown = expRes.breakdown;
    breakdown.paceFactor = loadRes.detail.paceFactor;
    breakdown.pace = loadRes.detail.pace;
    breakdown.previousPb = currentPb ? currentPb.value : null;
    /* どの指標を更新したのか（最長距離 / ベストペース など）を記録に残す */
    breakdown.pbHits = pbEval.hits.map(function (h) {
      return { key: h.key, label: h.label, text: h.text, previous: h.previous };
    });

    return {
      activityId: master.activityId,
      date: params.date,
      input: input,
      value: C.pbValue(master, input),
      unit: master.unit,
      load: loadRes.load,
      exp: expRes.exp,
      expBreakdown: breakdown,
      statGrowth: statGrowth,
      isPersonalBest: isPb,
      note: typeof params.note === 'string' ? params.note : '',
      calcVersion: ODL.CALC_VERSION,
      _streak: streak,
      _master: master
    };
  };

})(typeof window !== 'undefined' ? window : globalThis);
