/* =========================================================================
 * 俺だけレベルアップ / ui/history.js
 * カレンダー・履歴一覧・記録の詳細／編集／削除
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

  var viewState = {
    month: null,            /* 'YYYY-MM' */
    selectedDate: null,
    filterActivity: 'all',
    limit: 40
  };

  UI.views.history = function () {
    var data = Repo.data;
    var st = Repo.state();
    var root = UI.el('div');

    if (!viewState.month) viewState.month = U.monthKey(U.today());

    /* ---------------- カレンダー ---------------- */
    root.appendChild(UI.card(null, buildCalendar(st), { tight: true }));

    /* ---------------- 選択日 or 全履歴 ---------------- */
    if (viewState.selectedDate) {
      var day = data.trainingRecords.filter(function (r) { return r.date === viewState.selectedDate; });
      root.appendChild(UI.el('div', { class: 'section-title' }, [
        U.formatDateFull(viewState.selectedDate),
        UI.el('button', {
          class: 'btn small ghost', style: { float: 'right', marginTop: '-6px' },
          text: '選択解除', onclick: function () { viewState.selectedDate = null; ODL.App.refresh(); }
        })
      ]));
      if (day.length) {
        root.appendChild(UI.el('div', { class: 'list' },
          G.sortRecords(day).map(function (r) { return UI.recordRow(r, data); })));
        var dayExp = U.sum(day, function (r) { return r.exp; });
        root.appendChild(UI.el('div', { class: 'muted right mt8', text: 'この日の合計 +' + U.fmtInt(dayExp) + ' EXP' }));
      } else {
        root.appendChild(UI.empty('この日は記録がありません'));
      }
      root.appendChild(UI.el('button', {
        class: 'btn block mt16', text: 'この日に記録を追加',
        onclick: function () { UI.openRecordSheet({ date: viewState.selectedDate }); }
      }));
      return root;
    }

    /* フィルタ */
    var select = UI.el('select', {
      onchange: function () { viewState.filterActivity = select.value; viewState.limit = 40; ODL.App.refresh(); }
    }, [UI.el('option', { value: 'all', text: 'すべての種目' })].concat(
      data.activityMasters.map(function (m) {
        return UI.el('option', { value: m.activityId, text: m.name });
      })
    ));
    select.value = viewState.filterActivity;
    root.appendChild(UI.el('div', { class: 'field mt16' }, [select]));

    var list = data.trainingRecords.slice();
    if (viewState.filterActivity !== 'all') {
      list = list.filter(function (r) { return r.activityId === viewState.filterActivity; });
    }
    list = G.sortRecords(list).reverse();

    if (!list.length) {
      root.appendChild(UI.empty('記録がありません'));
      return root;
    }

    var shown = list.slice(0, viewState.limit);
    var byDate = {};
    var order = [];
    shown.forEach(function (r) {
      if (!byDate[r.date]) { byDate[r.date] = []; order.push(r.date); }
      byDate[r.date].push(r);
    });

    order.forEach(function (date) {
      var recs = byDate[date];
      var exp = U.sum(recs, function (r) { return r.exp; });
      root.appendChild(UI.el('div', { class: 'section-title' }, [
        U.formatDateFull(date),
        UI.el('span', { style: { float: 'right', color: 'var(--accent)' }, text: '+' + U.fmtInt(exp) + ' EXP' })
      ]));
      root.appendChild(UI.el('div', { class: 'list' }, recs.map(function (r) {
        return UI.recordRow(r, data);
      })));
    });

    if (list.length > viewState.limit) {
      root.appendChild(UI.el('button', {
        class: 'btn block ghost mt16', text: 'さらに表示（残り ' + (list.length - viewState.limit) + '件）',
        onclick: function () { viewState.limit += 40; ODL.App.refresh(); }
      }));
    } else {
      root.appendChild(UI.el('div', { class: 'muted center mt16', text: '全 ' + list.length + ' 件' }));
    }

    return root;
  };

  /* ---------------------------------------------------------------------
   * カレンダー
   * ------------------------------------------------------------------- */
  function buildCalendar(st) {
    var wrap = UI.el('div');
    var parts = viewState.month.split('-');
    var year = parseInt(parts[0], 10), month = parseInt(parts[1], 10);

    var head = UI.el('div', { class: 'cal-head' }, [
      UI.el('button', { text: '‹', onclick: function () { shiftMonth(-1); } }),
      UI.el('div', { class: 'm', text: year + '年' + month + '月' }),
      UI.el('button', { text: '›', onclick: function () { shiftMonth(1); } })
    ]);
    wrap.appendChild(head);

    var grid = UI.el('div', { class: 'cal-grid' });
    ['日', '月', '火', '水', '木', '金', '土'].forEach(function (d, i) {
      grid.appendChild(UI.el('div', { class: 'cal-dow' + (i === 0 ? ' sun' : i === 6 ? ' sat' : ''), text: d }));
    });

    var first = new Date(year, month - 1, 1);
    var startDow = first.getDay();
    var daysInMonth = new Date(year, month, 0).getDate();
    var today = U.today();

    for (var i = 0; i < startDow; i++) grid.appendChild(UI.el('div', { class: 'cal-cell blank' }));

    for (var d = 1; d <= daysInMonth; d++) {
      (function (day) {
        var ds = year + '-' + U.pad2(month) + '-' + U.pad2(day);
        var count = st.dateCounts[ds] || 0;
        var cls = 'cal-cell';
        if (count >= 3) cls += ' has lv3';
        else if (count === 2) cls += ' has lv2';
        else if (count === 1) cls += ' has lv1';
        if (ds === today) cls += ' today';
        var cell = UI.el('button', {
          class: cls,
          onclick: function () {
            viewState.selectedDate = (viewState.selectedDate === ds) ? null : ds;
            ODL.App.refresh();
          }
        }, [
          UI.el('span', { text: String(day) }),
          count > 0 ? UI.el('span', { class: 'cnt', text: count + '件' }) : null
        ]);
        grid.appendChild(cell);
      })(d);
    }

    wrap.appendChild(grid);

    /* 月サマリ */
    var monthRecords = Repo.data.trainingRecords.filter(function (r) { return U.monthKey(r.date) === viewState.month; });
    var days = {};
    monthRecords.forEach(function (r) { days[r.date] = true; });
    wrap.appendChild(UI.el('div', { class: 'cal-legend' }, [
      UI.el('span', { text: 'この月: ' + Object.keys(days).length + '日 / ' + monthRecords.length + '件 / +' + U.fmtInt(U.sum(monthRecords, function (r) { return r.exp; })) + ' EXP' })
    ]));

    return wrap;
  }

  function shiftMonth(delta) {
    var parts = viewState.month.split('-');
    var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1 + delta, 1);
    viewState.month = d.getFullYear() + '-' + U.pad2(d.getMonth() + 1);
    viewState.selectedDate = null;
    ODL.App.refresh();
  }

  /* ---------------------------------------------------------------------
   * 記録の詳細 / 編集 / 削除
   * ------------------------------------------------------------------- */
  UI.openRecordDetail = function (record) {
    var data = Repo.data;
    var master = G.findMaster(data, record.activityId);
    var name = master ? master.name : record.activityId;

    var rows = [
      UI.kv('日付', U.formatDateFull(record.date)),
      UI.kv('種目', (master && master.icon ? master.icon + ' ' : '') + U.escapeHtml(name)),
      UI.kv('内容', master ? U.escapeHtml(C.displayValue(master, record)) : U.fmtInt(record.value) + U.escapeHtml(record.unit || '')),
      UI.kv('負荷 Load', U.fmt(record.load, 2)),
      UI.kv('獲得EXP', '<span style="color:var(--accent)">+' + U.fmtInt(record.exp) + '</span>')
    ];

    var bd = record.expBreakdown || {};
    if (bd.base !== undefined) rows.push(UI.kv('　内訳: 基本', U.fmt(bd.base, 1)));
    if (bd.streakRate) rows.push(UI.kv('　内訳: ストリーク', '+' + Math.round(bd.streakRate * 100) + '%（' + bd.streakDays + '日）'));
    if (bd.pbRate) rows.push(UI.kv('　内訳: PB', '+' + Math.round(bd.pbRate * 100) + '%'));
    if (bd.paceFactor && bd.pace) rows.push(UI.kv('ペース', C.formatPace(bd.pace) + '（補正 ×' + U.fmt(bd.paceFactor, 2) + '）'));

    var growth = ODL.STATS.filter(function (s) { return record.statGrowth[s] > 0; });
    if (growth.length) {
      rows.push(UI.kv('ステータス成長', growth.map(function (s) {
        return '<span style="color:' + ODL.STAT_COLORS[s] + '">' + s + ' +' + U.fmt(record.statGrowth[s], 3) + '</span>';
      }).join('　')));
    }
    if (record.isPersonalBest) {
      var hits = (record.expBreakdown && record.expBreakdown.pbHits) || [];
      var hitText = hits.length
        ? hits.map(function (h) { return h.label + ' ' + h.text; }).join('　/　')
        : '更新記録';
      rows.push(UI.kv('パーソナルベスト', '<span style="color:var(--gold)">🎉 ' + U.escapeHtml(hitText) + '</span>'));
    }
    if (record.note) rows.push(UI.kv('メモ', U.escapeHtml(record.note)));
    rows.push(UI.kv('記録ID', '<span style="font-size:10px;color:var(--text-3)">' + U.escapeHtml(record.id) + '</span>'));

    var sheet = UI.sheet({
      title: '記録の詳細',
      content: [
        UI.el('div', {}, rows),
        UI.el('div', { class: 'hint mt16', text: 'この記録には、保存された時点の計算結果がそのまま残っています。あとから計算式を変更しても、この値は変わりません。' })
      ],
      actions: [
        {
          label: '編集', onClick: function () {
            UI.openRecordSheet({ record: record });
          }
        },
        {
          label: '削除', kind: 'danger', keepOpen: true, onClick: function (api) {
            UI.confirm({
              title: 'この記録を削除しますか？',
              message: U.formatDateJa(record.date) + ' の ' + name + ' を削除します。',
              warning: '削除すると、この記録ぶんのEXP・ステータス成長・PB・ストリークが再計算されます。取り消せません。',
              okLabel: '削除する', danger: true
            }).then(function (ok) {
              if (!ok) return;
              var res = Repo.deleteTrainingRecord(record.id);
              if (!res.ok) { UI.toast(res.errors[0], 'err'); return; }
              api.close();
              UI.toast('削除しました', 'ok');
              ODL.App.refresh();
            });
          }
        }
      ]
    });
  };

  UI.historyState = viewState;

})(typeof window !== 'undefined' ? window : globalThis);
