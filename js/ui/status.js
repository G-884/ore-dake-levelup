/* =========================================================================
 * 俺だけレベルアップ / ui/status.js
 * ステータス画面（5ステータス・成長推移・パーソナルベスト・種目別集計）
 * ========================================================================= */
(function (global) {
  'use strict';
  var ODL = global.ODL || (global.ODL = {});
  var U = ODL.Utils;
  var C = ODL.Calculator;
  var G = ODL.GameState;
  var Repo = ODL.Repository;
  var UI = ODL.UI;

  UI.views = UI.views || {};

  UI.views.status = function () {
    var data = Repo.data;
    var st = Repo.state();
    var s = data.settings;
    var root = UI.el('div');

    /* ---- Lv 概要 ---- */
    root.appendChild(UI.card('LEVEL', [
      UI.kv('レベル', 'Lv.' + st.level),
      UI.kv('累積EXP', U.fmtInt(st.cumulativeExp)),
      UI.kv('次のレベルまで', U.fmtInt(st.levelInfo.remaining) + ' EXP'),
      UI.kv('通算トレ日数', st.totalDays + ' 日'),
      UI.kv('通算記録数', st.totalRecords + ' 件'),
      UI.kv('最長ストリーク', st.streak.best + ' 日')
    ]));

    /* ---- 5ステータス ---- */
    var maxStat = Math.max(U.num(s.display.statBarMax, 60),
      Math.ceil(Math.max.apply(null, ODL.STATS.map(function (k) { return st.stats[k]; })) / 10) * 10);

    var growthSinceMonth = statsDelta(data, 30);

    var statCard = UI.el('div', { class: 'card' });
    statCard.appendChild(UI.el('div', { class: 'card-title', text: 'STATUS' }));
    ODL.STATS.forEach(function (k) {
      var v = st.stats[k];
      var pct = U.clamp((v / maxStat) * 100, 0, 100);
      var delta = growthSinceMonth[k];
      statCard.appendChild(UI.el('div', { class: 'stat-big stat-' + k }, [
        UI.el('div', { class: 'top' }, [
          UI.el('div', { class: 'nm', html: k + '<span>' + ODL.STAT_LABELS_LONG[k] + '</span>' }),
          UI.el('div', { class: 'vl', text: U.fmt(v, 1) })
        ]),
        UI.el('div', { class: 'stat-bar' }, [UI.el('i', { style: { width: pct + '%' } })]),
        UI.el('div', { class: 'sub', text: delta > 0 ? '直近30日: +' + U.fmt(delta, 2) : '直近30日: 変化なし' })
      ]));
    });
    root.appendChild(statCard);

    /* ---- 成長推移 ---- */
    var series = buildGrowthSeries(data);
    if (series.labels.length >= 2) {
      root.appendChild(UI.card('成長の推移', [
        UI.lineChart(series.series, {}),
        UI.el('div', { class: 'chart-legend' }, ODL.STATS.map(function (k) {
          return UI.el('span', {}, [
            UI.el('i', { class: 'dot-' + k, style: { display: 'inline-block', width: '9px', height: '9px', borderRadius: '2px', marginRight: '4px' } }),
            UI.el('span', { text: k })
          ]);
        })),
        UI.el('div', { class: 'muted mt8', text: series.labels[0] + ' 〜 ' + series.labels[series.labels.length - 1] })
      ]));
    }

    /* ---- パーソナルベスト ---- */
    var pbRows = [];
    data.activityMasters.slice().sort(function (a, b) { return a.sortOrder - b.sortOrder; }).forEach(function (m) {
      var pb = st.pbs[m.activityId];
      if (!pb) return;
      var metrics = Object.keys(pb.metrics || {}).map(function (k) { return pb.metrics[k]; });
      if (!metrics.length) metrics = [{ label: '記録', text: pb.label, date: pb.date }];

      if (metrics.length === 1) {
        pbRows.push(UI.el('div', { class: 'row' }, [
          UI.el('div', { class: 'icon', text: m.icon || '🏋️' }),
          UI.el('div', { class: 'body' }, [
            UI.el('div', { class: 't', text: m.name }),
            UI.el('div', { class: 's', text: U.formatDateJa(metrics[0].date, true) })
          ]),
          UI.el('div', { class: 'end' }, [
            UI.el('div', { class: 'exp', style: { color: 'var(--gold)' }, text: metrics[0].text })
          ])
        ]));
        return;
      }

      /* 指標が複数ある種目（ランニングなど）は縦に並べる */
      pbRows.push(UI.el('div', { class: 'row', style: { alignItems: 'flex-start' } }, [
        UI.el('div', { class: 'icon', text: m.icon || '🏋️' }),
        UI.el('div', { class: 'body' }, [
          UI.el('div', { class: 't', text: m.name }),
          UI.el('div', { style: { marginTop: '4px' } }, metrics.map(function (mm) {
            return UI.el('div', {
              style: { display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12px', padding: '2px 0' }
            }, [
              UI.el('span', { style: { color: 'var(--text-3)' }, text: mm.label }),
              UI.el('span', {}, [
                UI.el('b', { style: { color: 'var(--gold)' }, text: mm.text }),
                UI.el('span', { style: { color: 'var(--text-3)', marginLeft: '8px' }, text: U.formatDateJa(mm.date) })
              ])
            ]);
          }))
        ])
      ]));
    });
    root.appendChild(UI.card('PERSONAL BEST',
      pbRows.length ? UI.el('div', { class: 'list' }, pbRows) : UI.empty('まだ記録がありません')));

    /* ---- 種目別集計 ---- */
    var byAct = U.groupBy(data.trainingRecords, function (r) { return r.activityId; });
    var actRows = [];
    data.activityMasters.slice().sort(function (a, b) { return a.sortOrder - b.sortOrder; }).forEach(function (m) {
      var list = byAct[m.activityId];
      if (!list || !list.length) return;
      var exp = U.sum(list, function (r) { return r.exp; });
      var total = totalAmount(m, list);
      actRows.push(UI.el('div', { class: 'row' }, [
        UI.el('div', { class: 'icon', text: m.icon || '🏋️' }),
        UI.el('div', { class: 'body' }, [
          UI.el('div', { class: 't', text: m.name }),
          UI.el('div', { class: 's', text: list.length + '回 ・ 累計 ' + total })
        ]),
        UI.el('div', { class: 'end' }, [
          UI.el('div', { class: 'exp', text: '+' + U.fmtInt(exp) }),
          UI.el('div', { class: 'sub', text: 'EXP' })
        ])
      ]));
    });
    if (actRows.length) {
      root.appendChild(UI.card('種目別の積み上げ', UI.el('div', { class: 'list' }, actRows)));
    }

    return root;
  };

  function totalAmount(master, list) {
    switch (master.inputType) {
      case 'reps':
        return U.fmtInt(U.sum(list, function (r) { return U.num(r.input.reps, 0); })) + '回';
      case 'weight_reps':
        return U.fmtInt(U.sum(list, function (r) { return U.num(r.input.reps, 0); })) + '回';
      case 'minutes':
        return U.fmtInt(U.sum(list, function (r) { return U.num(r.input.minutes, 0); })) + '分';
      case 'distance_time':
        return U.fmt(U.sum(list, function (r) { return U.num(r.input.distance, 0); }), 1) + 'km';
      default:
        return '';
    }
  }

  /* 直近n日のステータス増分 */
  function statsDelta(data, days) {
    var since = U.addDays(U.today(), -days);
    var out = U.zeroStats();
    (data.trainingRecords || []).forEach(function (r) {
      if (U.diffDays(since, r.date) < 0) return;
      ODL.STATS.forEach(function (s) { out[s] += U.num(r.statGrowth[s], 0); });
    });
    return out;
  }

  /* 月ごとのステータス推移 */
  function buildGrowthSeries(data) {
    var sorted = G.sortRecords(data.trainingRecords);
    var labels = [];
    var points = {};
    ODL.STATS.forEach(function (s) { points[s] = []; });

    if (!sorted.length) return { labels: [], series: [] };

    var init = U.num(data.settings.growth.initialStat, 10);
    var cur = {};
    ODL.STATS.forEach(function (s) { cur[s] = init; });

    var monthMap = {};
    sorted.forEach(function (r) {
      ODL.STATS.forEach(function (s) { cur[s] += U.num(r.statGrowth[s], 0); });
      monthMap[U.monthKey(r.date)] = U.clone(cur);
    });

    var months = Object.keys(monthMap).sort();
    /* 表示は直近18ヶ月まで */
    months = months.slice(-18);
    months.forEach(function (m, i) {
      labels.push(m);
      ODL.STATS.forEach(function (s) { points[s].push({ x: i, y: monthMap[m][s] }); });
    });

    return {
      labels: labels,
      series: ODL.STATS.map(function (s) {
        return { name: s, color: ODL.STAT_COLORS[s], points: points[s] };
      })
    };
  }

})(typeof window !== 'undefined' ? window : globalThis);
