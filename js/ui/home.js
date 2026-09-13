/* =========================================================================
 * 俺だけレベルアップ / ui/home.js
 * ホーム＝「ゲームとしての現在状態」が一目で分かるダッシュボード
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

  UI.views.home = function () {
    var data = Repo.data;
    var st = Repo.state();
    var s = data.settings;
    var root = UI.el('div');

    /* ---- Lv / EXP ---- */
    var hero = UI.el('div', { class: 'card hero' }, [
      UI.el('div', { class: 'lv-label', text: 'LEVEL' }),
      UI.el('div', { class: 'lv-value', html: '<small>Lv.</small>' + st.level }),
      UI.el('div', { class: 'expbar' }, [
        UI.el('i', { style: { width: (st.levelInfo.progress * 100) + '%' } })
      ]),
      UI.el('div', { class: 'exp-text', html:
        '<b>' + U.fmtInt(st.cumulativeExp) + '</b> / ' + U.fmtInt(st.levelInfo.nextLevelExp) + ' EXP' +
        '<br><span style="font-size:11px;color:var(--text-3)">次のレベルまで ' + U.fmtInt(st.levelInfo.remaining) + ' EXP</span>'
      })
    ]);
    root.appendChild(hero);

    /* ---- ステータス ---- */
    var maxStat = Math.max(U.num(s.display.statBarMax, 60),
      Math.ceil(Math.max.apply(null, ODL.STATS.map(function (k) { return st.stats[k]; })) / 10) * 10);
    root.appendChild(UI.card('STATUS', [
      UI.el('div', { class: 'stats' }, ODL.STATS.map(function (k) {
        return UI.statRow(k, st.stats[k], s, maxStat);
      }))
    ], {
      action: UI.el('button', {
        class: 'btn small ghost', text: '詳細 ›',
        onclick: function () { ODL.App.go('status'); }
      })
    }));

    /* ---- 指標 ---- */
    var streakText = st.streak.alive ? st.streak.current + '日' : '—';
    root.appendChild(UI.el('div', { class: 'metrics' }, [
      UI.metric('🔥 ' + streakText, 'ストリーク', 'flame'),
      UI.metric(String(st.monthRecordCount) + '<span style="font-size:12px"> 回</span>', '今月の記録'),
      UI.metric(String(st.totalDays) + '<span style="font-size:12px"> 日</span>', '通算トレ日数')
    ]));

    if (st.streak.alive && st.streak.breaksInDays !== null) {
      var warn = st.streak.breaksInDays <= 1;
      root.appendChild(UI.el('div', {
        class: 'muted center', style: { margin: '10px 0 2px', color: warn ? 'var(--gold)' : 'var(--text-3)' },
        text: st.streak.daysSinceLast === 0
          ? '今日も記録済み。連続 ' + st.streak.current + '日目（トレ' + st.streak.activeDays + '日）'
          : st.streak.breaksInDays === 0
            ? '今日記録しないとストリークが途切れます'
            : 'あと ' + st.streak.breaksInDays + '日以内に記録すればストリークは続きます'
      }));
    } else if (!st.streak.alive && st.totalRecords > 0) {
      root.appendChild(UI.el('div', { class: 'muted center', style: { margin: '10px 0 2px' },
        text: 'ストリークは途切れていますが、Lv・ステータス・記録はそのままです。今日から再開しましょう。' }));
    }

    /* ---- 今日のトレーニング ---- */
    var todayCard = UI.el('div');
    if (st.todayRecords.length) {
      todayCard = UI.card('今日のトレーニング（+' + U.fmtInt(st.todayExp) + ' EXP）',
        UI.el('div', { class: 'list' }, st.todayRecords.map(function (r) {
          return recordRow(r, data);
        })));
    } else {
      todayCard = UI.card('今日のトレーニング', UI.empty('まだ記録がありません'));
    }
    root.appendChild(UI.el('div', { class: 'mt16' }, todayCard));

    /* ---- 記録ボタン ---- */
    root.appendChild(UI.el('button', {
      class: 'record-cta mt8', text: '＋  記録する',
      onclick: function () { UI.openRecordSheet({}); }
    }));

    /* ---- 最近の記録 ---- */
    var recent = G.sortRecords(data.trainingRecords).reverse()
      .filter(function (r) { return r.date !== st.asOf; }).slice(0, 5);
    if (recent.length) {
      root.appendChild(UI.el('div', { class: 'section-title', text: '最近の記録' }));
      root.appendChild(UI.el('div', { class: 'list' }, recent.map(function (r) {
        return recordRow(r, data, true);
      })));
      root.appendChild(UI.el('button', {
        class: 'btn block ghost mt8', text: 'すべての履歴を見る',
        onclick: function () { ODL.App.go('history'); }
      }));
    }

    return root;
  };

  function recordRow(r, data, showDate) {
    var master = G.findMaster(data, r.activityId);
    var name = master ? master.name : r.activityId;
    var icon = master ? (master.icon || '🏋️') : '❓';
    var val = master ? C.displayValue(master, r) : U.fmtInt(r.value) + (r.unit || '');
    return UI.el('div', { class: 'row tappable', onclick: function () { UI.openRecordDetail(r); } }, [
      UI.el('div', { class: 'icon', text: icon }),
      UI.el('div', { class: 'body' }, [
        UI.el('div', { class: 't', html: UI.escapeName(name) + ' ' + UI.escapeName(val) + (r.isPersonalBest ? '<span class="chip">PB</span>' : '') }),
        UI.el('div', { class: 's', text: (showDate ? U.formatDateJa(r.date, true) + ' ・ ' : '') + 'Load ' + U.fmt(r.load, 1) })
      ]),
      UI.el('div', { class: 'end' }, [
        UI.el('div', { class: 'exp', text: '+' + U.fmtInt(r.exp) }),
        UI.el('div', { class: 'sub', text: 'EXP' })
      ])
    ]);
  }

  UI.recordRow = recordRow;
  UI.escapeName = function (s) { return U.escapeHtml(s); };

})(typeof window !== 'undefined' ? window : globalThis);
