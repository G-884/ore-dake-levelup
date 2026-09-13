/* =========================================================================
 * 俺だけレベルアップ / calculator.js
 *
 * 計算式はすべてここに集約する。UI側に計算式を書かない。
 * 係数はすべて settings / activityMaster から受け取り、ここには埋め込まない。
 *
 *   Load        … トレーニング量を「負荷」に変換した値
 *   EXP         … Load × expCoefficient × 倍率 × (1 + ストリーク + PB)
 *   Lv          … 累積EXPから算出
 *   StatGrowth  … Load × growthCoefficient × 配分 × 成長補正
 *   Streak      … 記録日の並びから算出
 * ========================================================================= */
(function (global) {
  'use strict';
  var ODL = global.ODL || (global.ODL = {});
  var U = ODL.Utils;
  var C = ODL.Calculator = {};

  /* ---------------------------------------------------------------------
   * 入力値の検証
   * ------------------------------------------------------------------- */
  C.validateInput = function (master, input) {
    var errors = [];
    var fields = (ODL.INPUT_TYPES[master.inputType] || ODL.INPUT_TYPES.reps).fields;
    var labels = {
      reps: '回数', weight: '重量', minutes: '時間', distance: '距離', durationMin: 'タイム'
    };
    fields.forEach(function (f) {
      /* タイムは任意入力（未入力ならペース補正なし） */
      var optional = (f === 'durationMin');
      var raw = input ? input[f] : undefined;
      if (raw === '' || raw === null || raw === undefined) {
        if (!optional) errors.push(labels[f] + 'を入力してください。');
        return;
      }
      var n = U.num(raw, NaN);
      if (!isFinite(n)) { errors.push(labels[f] + 'は数値で入力してください。'); return; }
      if (n <= 0) { errors.push(labels[f] + 'は0より大きい値を入力してください。'); return; }
      if (n > 1000000) { errors.push(labels[f] + 'の値が大きすぎます。'); }
    });
    return { ok: errors.length === 0, errors: errors };
  };

  /* ---------------------------------------------------------------------
   * Load
   * ------------------------------------------------------------------- */
  C.calculateLoad = function (master, input, settings) {
    var lc = U.num(master.loadCoefficient, 1);
    var detail = { paceFactor: null, pace: null };
    var load = 0;

    switch (master.inputType) {
      case 'reps': {
        var reps = U.num(input.reps, 0);
        load = reps > 0 ? lc * Math.sqrt(reps) : 0;
        break;
      }
      case 'weight_reps': {
        var w = U.num(input.weight, 0);
        var r = U.num(input.reps, 0);
        load = (w > 0 && r > 0) ? lc * Math.sqrt(w * r) : 0;
        break;
      }
      case 'minutes': {
        var m = U.num(input.minutes, 0);
        load = m > 0 ? lc * Math.sqrt(m) : 0;
        break;
      }
      case 'distance_time': {
        var d = U.num(input.distance, 0);
        var dur = U.num(input.durationMin, 0);
        var pf = 1;
        if (d > 0 && dur > 0) {
          var pace = dur / d;                      /* 分/km */
          var basePace = U.num(settings.pace.basePaceMinPerKm, 6);
          pf = Math.sqrt(basePace / pace);
          pf = U.clamp(pf, U.num(settings.pace.minPaceFactor, 0.6),
                           U.num(settings.pace.maxPaceFactor, 1.6));
          detail.pace = pace;
        }
        detail.paceFactor = pf;
        load = d > 0 ? d * lc * pf : 0;
        break;
      }
      default:
        load = 0;
    }

    return { load: U.round(Math.max(0, load), 4), detail: detail };
  };

  /* ---------------------------------------------------------------------
   * EXP
   * ------------------------------------------------------------------- */
  C.streakBonusRate = function (streakDays, settings) {
    var table = (settings.streak && settings.streak.bonusTable) || [];
    var rate = 0;
    table.forEach(function (b) {
      if (U.num(streakDays, 0) >= U.num(b.days, 0)) rate = U.num(b.rate, 0);
    });
    return rate;
  };

  C.calculateExp = function (load, master, settings, ctx) {
    ctx = ctx || {};
    var base = U.num(load, 0)
      * U.num(master.expCoefficient, 1)
      * U.num(settings.exp.expMultiplier, 1);

    var streakRate = C.streakBonusRate(ctx.streakDays || 0, settings);
    var pbRate = (settings.pb && settings.pb.enabled && ctx.isPersonalBest)
      ? U.num(settings.pb.bonus, 0) : 0;

    var total = base * (1 + streakRate + pbRate);

    return {
      exp: U.round(Math.max(0, total), 2),
      breakdown: {
        base: U.round(base, 2),
        streakDays: U.num(ctx.streakDays, 0),
        streakRate: streakRate,
        streakBonus: U.round(base * streakRate, 2),
        isPersonalBest: !!ctx.isPersonalBest,
        pbRate: pbRate,
        pbBonus: U.round(base * pbRate, 2)
      }
    };
  };

  /* ---------------------------------------------------------------------
   * レベル
   *   Lv = floor(sqrt(累積EXP / k)) + 1
   *   Lv n に必要な累積EXP = (n-1)^2 * k
   * ------------------------------------------------------------------- */
  C.expForLevel = function (level, settings) {
    var k = U.num(settings.exp.levelCoefficient, 40);
    var n = Math.max(1, Math.floor(level));
    return (n - 1) * (n - 1) * k;
  };

  C.calculateLevel = function (cumulativeExp, settings) {
    var k = U.num(settings.exp.levelCoefficient, 40);
    var exp = Math.max(0, U.num(cumulativeExp, 0));
    var level = Math.floor(Math.sqrt(exp / k)) + 1;
    if (!isFinite(level) || level < 1) level = 1;

    var cur = C.expForLevel(level, settings);
    var next = C.expForLevel(level + 1, settings);
    var span = next - cur;
    var into = exp - cur;

    return {
      level: level,
      cumulativeExp: exp,
      currentLevelExp: cur,
      nextLevelExp: next,
      expIntoLevel: into,
      expForNextLevel: span,
      remaining: Math.max(0, next - exp),
      progress: span > 0 ? U.clamp(into / span, 0, 1) : 0
    };
  };

  /* ---------------------------------------------------------------------
   * ステータス成長
   *   BaseGrowth  = Load × growthCoefficient
   *   Correction  = sqrt(statBase / currentStat)   （下限あり）
   *   Growth      = BaseGrowth × 配分率 × Correction
   * ------------------------------------------------------------------- */
  C.growthCorrection = function (currentStat, settings) {
    var base = U.num(settings.growth.statBase, 10);
    var cur = Math.max(U.num(currentStat, base), 0.1);
    var corr = Math.sqrt(base / cur);
    var min = U.num(settings.growth.minCorrection, 0.15);
    return Math.max(min, corr);
  };

  C.calculateStatGrowth = function (load, master, currentStats, settings) {
    var g = U.num(load, 0) * U.num(settings.growth.growthCoefficient, 0.0025);
    var alloc = master.statAllocation || {};
    var totalAlloc = 0;
    ODL.STATS.forEach(function (s) { totalAlloc += U.num(alloc[s], 0); });

    var out = U.zeroStats();
    if (g <= 0 || totalAlloc <= 0) return out;

    ODL.STATS.forEach(function (s) {
      var rate = U.num(alloc[s], 0) / totalAlloc;   /* 合計100%でなくても正規化する */
      if (rate <= 0) return;
      var corr = C.growthCorrection(currentStats ? currentStats[s] : undefined, settings);
      out[s] = U.round(g * rate * corr, 4);
    });
    return out;
  };

  /* ---------------------------------------------------------------------
   * ストリーク
   *   「記録なしが resetAfterDays 日連続」でリセット。
   *   → 記録日どうしの間隔が resetAfterDays 日以内なら継続扱い。
   *
   *   currentStreak … 継続中チェーンの開始日から asOf 日までの経過日数
   *   activeDays    … そのチェーン内で実際にトレーニングした日数
   * ------------------------------------------------------------------- */
  C.calculateStreak = function (dateList, settings, asOfDate) {
    var gapLimit = Math.max(1, U.num(settings.streak.resetAfterDays, 3));
    var asOf = U.isDateStr(asOfDate) ? asOfDate : U.today();

    var dates = {};
    (dateList || []).forEach(function (d) { if (U.isDateStr(d)) dates[d] = true; });
    var sorted = Object.keys(dates).sort();

    var empty = {
      current: 0, activeDays: 0, best: 0, bestActiveDays: 0,
      alive: false, startDate: null, lastDate: null, daysSinceLast: null,
      breaksInDays: null
    };
    if (!sorted.length) return empty;

    /* 対象は asOf 以前の記録のみ（未来日の記録はストリーク判定に使わない） */
    var past = sorted.filter(function (d) { return U.diffDays(d, asOf) >= 0; });
    if (!past.length) return empty;

    var chains = [];
    var chain = [past[0]];
    for (var i = 1; i < past.length; i++) {
      var gap = U.diffDays(past[i - 1], past[i]);
      if (gap <= gapLimit) chain.push(past[i]);
      else { chains.push(chain); chain = [past[i]]; }
    }
    chains.push(chain);

    var best = 0, bestActive = 0;
    chains.forEach(function (ch) {
      var span = U.diffDays(ch[0], ch[ch.length - 1]) + 1;
      if (span > best) best = span;
      if (ch.length > bestActive) bestActive = ch.length;
    });

    var last = chains[chains.length - 1];
    var lastDate = last[last.length - 1];
    var daysSinceLast = U.diffDays(lastDate, asOf);
    var alive = daysSinceLast <= gapLimit;

    var current = alive ? (U.diffDays(last[0], asOf) + 1) : 0;
    if (alive && current > best) best = current;
    var activeDays = alive ? last.length : 0;
    if (activeDays > bestActive) bestActive = activeDays;

    return {
      current: current,
      activeDays: activeDays,
      best: best,
      bestActiveDays: bestActive,
      alive: alive,
      startDate: alive ? last[0] : null,
      lastDate: lastDate,
      daysSinceLast: daysSinceLast,
      /* あと何日記録がないと途切れるか */
      breaksInDays: alive ? Math.max(0, gapLimit - daysSinceLast) : 0
    };
  };

  /* ---------------------------------------------------------------------
   * パーソナルベスト
   *   1回の記録の「代表値」で比較する。
   *   reps → 回数 / weight_reps → 重量×回数 / minutes → 分 / distance_time → km
   * ------------------------------------------------------------------- */
  C.pbValue = function (master, input) {
    switch (master.inputType) {
      case 'reps':        return U.num(input.reps, 0);
      case 'weight_reps': return U.num(input.weight, 0) * U.num(input.reps, 0);
      case 'minutes':     return U.num(input.minutes, 0);
      case 'distance_time': return U.num(input.distance, 0);
      default:            return 0;
    }
  };

  C.pbLabel = function (master, record) {
    var input = record.input || {};
    switch (master.inputType) {
      case 'weight_reps':
        return U.fmt(U.num(input.weight, 0), 1) + 'kg × ' + U.fmtInt(input.reps) + '回';
      case 'distance_time':
        return U.fmt(U.num(input.distance, 0), 2) + 'km';
      case 'minutes':
        return U.fmtInt(input.minutes) + '分';
      default:
        return U.fmtInt(input.reps) + '回';
    }
  };

  /* 記録の代表表示値（履歴などで使う） */
  C.displayValue = function (master, record) {
    var input = record.input || {};
    switch (master.inputType) {
      case 'weight_reps':
        return U.fmt(U.num(input.weight, 0), 1) + 'kg × ' + U.fmtInt(input.reps) + '回';
      case 'distance_time': {
        var s = U.fmt(U.num(input.distance, 0), 2) + 'km';
        var dur = U.num(input.durationMin, 0);
        if (dur > 0) s += ' / ' + C.formatDuration(dur);
        return s;
      }
      case 'minutes':
        return U.fmtInt(input.minutes) + '分';
      default:
        return U.fmtInt(input.reps) + '回';
    }
  };

  C.formatDuration = function (minutes) {
    var total = Math.round(U.num(minutes, 0) * 60);
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    if (h > 0) return h + '時間' + m + '分';
    if (s > 0) return m + '分' + s + '秒';
    return m + '分';
  };

  /* PB判定（同値では更新扱いにしない） */
  C.isNewPersonalBest = function (master, input, currentPb) {
    var v = C.pbValue(master, input);
    if (v <= 0) return false;
    if (!currentPb) return true;
    return v > U.num(currentPb.value, 0) + 1e-9;
  };

})(typeof window !== 'undefined' ? window : globalThis);
