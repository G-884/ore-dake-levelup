/* =========================================================================
 * 俺だけレベルアップ / ui/body.js
 * 身体データ画面。
 * ここで扱う実測値は、EXP・Lv・STR等の計算には一切使用しない。
 * ゲームデータと現実の身体測定データは混ぜない。
 * ========================================================================= */
(function (global) {
  'use strict';
  var ODL = global.ODL || (global.ODL = {});
  var U = ODL.Utils;
  var Repo = ODL.Repository;
  var UI = ODL.UI;

  UI.views = UI.views || {};
  var bodyState = { chartMetric: null };

  UI.views.body = function () {
    var data = Repo.data;
    var root = UI.el('div');
    var metrics = (data.bodyMetrics || []).filter(function (m) { return m.active; })
      .sort(function (a, b) { return a.sortOrder - b.sortOrder; });
    var records = (data.bodyRecords || []).slice().sort(function (a, b) {
      return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
    });

    root.appendChild(UI.el('div', { class: 'okbox', style: { marginBottom: '12px' },
      text: '身体データはゲームのステータス（STR/VIT/…）とは別管理です。EXPやレベルの計算には一切使われません。' }));

    /* ---- 最新値 ---- */
    var latest = {};
    records.slice().reverse().forEach(function (r) {
      Object.keys(r.values).forEach(function (k) { latest[k] = { value: r.values[k], date: r.date }; });
    });

    var latestRows = metrics.filter(function (m) { return latest[m.metricId]; }).map(function (m) {
      var l = latest[m.metricId];
      var prev = previousValue(records, m.metricId, l.date);
      var diff = prev !== null ? l.value - prev : null;
      var diffText = diff === null ? '' :
        (diff > 0 ? '▲ +' + U.fmt(diff, 1) : diff < 0 ? '▼ ' + U.fmt(diff, 1) : '→ ±0');
      return UI.el('div', { class: 'row' }, [
        UI.el('div', { class: 'body' }, [
          UI.el('div', { class: 't', text: m.name }),
          UI.el('div', { class: 's', text: U.formatDateJa(l.date) + (diffText ? ' ・ 前回比 ' + diffText : '') })
        ]),
        UI.el('div', { class: 'end' }, [
          UI.el('div', { class: 'exp', style: { color: 'var(--text)' }, text: U.fmt(l.value, 1) }),
          UI.el('div', { class: 'sub', text: m.unit })
        ])
      ]);
    });

    root.appendChild(UI.card('最新の測定値',
      latestRows.length ? UI.el('div', { class: 'list' }, latestRows) : UI.empty('まだ記録がありません')));

    root.appendChild(UI.el('button', {
      class: 'btn primary block', text: '＋ 身体データを記録',
      onclick: function () { openBodySheet(null); }
    }));

    /* ---- 推移グラフ ---- */
    var chartable = metrics.filter(function (m) {
      return records.filter(function (r) { return r.values[m.metricId] !== undefined; }).length >= 2;
    });
    if (chartable.length) {
      if (!bodyState.chartMetric || !chartable.some(function (m) { return m.metricId === bodyState.chartMetric; })) {
        /* 変化を見たいのはまず体重なので、あれば体重を初期表示にする */
        var pref = chartable.filter(function (m) { return m.metricId === 'weight'; })[0];
        bodyState.chartMetric = (pref || chartable[0]).metricId;
      }
      var sel = UI.el('select', {
        onchange: function () { bodyState.chartMetric = sel.value; ODL.App.refresh(); }
      }, chartable.map(function (m) { return UI.el('option', { value: m.metricId, text: m.name }); }));
      sel.value = bodyState.chartMetric;

      var metric = chartable.filter(function (m) { return m.metricId === bodyState.chartMetric; })[0];
      var pts = records.filter(function (r) { return r.values[metric.metricId] !== undefined; })
        .map(function (r) { return { x: U.parseDate(r.date), y: r.values[metric.metricId] }; })
        .sort(function (a, b) { return a.x - b.x; });

      root.appendChild(UI.card('推移', [
        UI.el('div', { class: 'field' }, [sel]),
        UI.lineChart([{ name: metric.name, color: '#4dd9ff', points: pts }], {}),
        UI.el('div', { class: 'muted mt8', text: metric.name + '（' + metric.unit + '） ' + pts.length + '件' })
      ]));
    }

    /* ---- 履歴 ---- */
    if (records.length) {
      root.appendChild(UI.el('div', { class: 'section-title', text: '測定履歴' }));
      root.appendChild(UI.el('div', { class: 'list' }, records.slice(0, 40).map(function (r) {
        var summary = metrics.filter(function (m) { return r.values[m.metricId] !== undefined; })
          .map(function (m) { return m.name + ' ' + U.fmt(r.values[m.metricId], 1) + m.unit; })
          .join(' ／ ');
        return UI.el('div', { class: 'row tappable', onclick: function () { openBodySheet(r); } }, [
          UI.el('div', { class: 'icon', text: '📏' }),
          UI.el('div', { class: 'body' }, [
            UI.el('div', { class: 't', text: U.formatDateJa(r.date, true) }),
            UI.el('div', { class: 's', text: summary || '（データなし）' })
          ])
        ]);
      })));
    }

    /* ---- 測定項目の管理 ---- */
    root.appendChild(UI.el('button', {
      class: 'btn block ghost mt16', text: '測定項目を編集',
      onclick: openMetricList
    }));

    return root;
  };

  function previousValue(recordsDesc, metricId, beforeDate) {
    for (var i = 0; i < recordsDesc.length; i++) {
      var r = recordsDesc[i];
      if (r.date >= beforeDate) continue;
      if (r.values[metricId] !== undefined) return r.values[metricId];
    }
    return null;
  }

  /* ---------------------------------------------------------------------
   * 入力シート
   * ------------------------------------------------------------------- */
  function openBodySheet(record) {
    var data = Repo.data;
    var metrics = (data.bodyMetrics || []).filter(function (m) { return m.active; })
      .sort(function (a, b) { return a.sortOrder - b.sortOrder; });

    var dateInput = UI.el('input', { type: 'date', value: record ? record.date : U.today(), max: U.today() });
    var inputs = {};
    var content = [UI.el('div', { class: 'field' }, [UI.el('label', { text: '測定日' }), dateInput])];

    /* 直近値をプレースホルダにする */
    var recordsDesc = (data.bodyRecords || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });

    metrics.forEach(function (m) {
      var last = null;
      for (var i = 0; i < recordsDesc.length; i++) {
        if (recordsDesc[i].values[m.metricId] !== undefined) { last = recordsDesc[i].values[m.metricId]; break; }
      }
      var input = UI.el('input', {
        type: 'number', step: m.step, min: '0', inputmode: 'decimal',
        placeholder: last !== null ? String(last) : '',
        value: record && record.values[m.metricId] !== undefined ? record.values[m.metricId] : ''
      });
      inputs[m.metricId] = input;
      content.push(UI.el('div', { class: 'field' }, [
        UI.el('label', { text: m.name }),
        UI.el('div', { class: 'unit-suffix' }, [input, UI.el('span', { text: m.unit })])
      ]));
    });

    var noteInput = UI.el('input', { type: 'text', maxlength: '120', placeholder: '（任意）', value: record ? record.note : '' });
    content.push(UI.el('div', { class: 'field' }, [UI.el('label', { text: 'メモ' }), noteInput]));
    content.push(UI.el('div', { class: 'hint', text: '入力した項目だけが保存されます。空欄の項目は記録されません。' }));

    var actions = [{ label: 'キャンセル' }];
    if (record) {
      actions.push({
        label: '削除', kind: 'danger', keepOpen: true, onClick: function (api) {
          UI.confirm({ title: 'この測定を削除しますか？', okLabel: '削除する', danger: true }).then(function (ok) {
            if (!ok) return;
            Repo.deleteBodyRecord(record.id);
            api.close();
            UI.toast('削除しました', 'ok');
            ODL.App.refresh();
          });
        }
      });
    }
    actions.push({
      label: '保存', kind: 'primary', keepOpen: true, onClick: function (api) {
        if (!U.isDateStr(dateInput.value)) { UI.toast('日付を選んでください', 'err'); return; }
        var values = {};
        Object.keys(inputs).forEach(function (k) { values[k] = inputs[k].value; });
        var res = Repo.addBodyRecord({
          id: record ? record.id : null,
          date: dateInput.value, values: values, note: noteInput.value.trim()
        });
        if (!res.ok) { UI.toast(res.errors[0], 'err'); return; }
        if (res.saveResult && !res.saveResult.ok) UI.toast(UI.saveErrorMessage(res.saveResult.error), 'err', 5000);
        api.close();
        UI.toast('保存しました', 'ok');
        ODL.App.refresh();
      }
    });

    UI.sheet({ title: record ? '測定を編集' : '身体データを記録', content: content, actions: actions });
  }

  /* ---------------------------------------------------------------------
   * 測定項目の管理
   * ------------------------------------------------------------------- */
  function openMetricList() {
    var data = Repo.data;
    var content = UI.el('div', { class: 'list' }, data.bodyMetrics
      .slice().sort(function (a, b) { return a.sortOrder - b.sortOrder; })
      .map(function (m) {
        return UI.el('div', { class: 'row' }, [
          UI.el('div', { class: 'body' }, [
            UI.el('div', { class: 't', text: m.name }),
            UI.el('div', { class: 's', text: '単位: ' + m.unit })
          ]),
          UI.el('div', { class: 'end' }, [
            UI.toggle(m.active, function (v) {
              Repo.upsertBodyMetric(U.mergeDefaults({ active: v }, m));
              UI.toast(v ? '表示にしました' : '非表示にしました', 'ok');
            })
          ])
        ]);
      }));

    UI.sheet({
      title: '測定項目',
      content: [content, UI.el('div', { class: 'hint mt8', text: '非表示にしても、過去の測定データは削除されません。' })],
      actions: [
        { label: '閉じる' },
        { label: '＋ 項目を追加', kind: 'primary', onClick: function () { setTimeout(openMetricForm, 220); } }
      ]
    });
  }

  function openMetricForm() {
    var nameInput = UI.el('input', { type: 'text', placeholder: '例）ふくらはぎ' });
    var unitInput = UI.el('input', { type: 'text', placeholder: '例）cm', value: 'cm' });
    UI.sheet({
      title: '測定項目を追加',
      content: [
        UI.el('div', { class: 'field' }, [UI.el('label', { text: '項目名' }), nameInput]),
        UI.el('div', { class: 'field' }, [UI.el('label', { text: '単位' }), unitInput])
      ],
      actions: [
        { label: 'キャンセル' },
        {
          label: '追加', kind: 'primary', keepOpen: true, onClick: function (api) {
            var name = nameInput.value.trim();
            if (!name) { UI.toast('項目名を入力してください', 'err'); return; }
            var res = Repo.upsertBodyMetric({
              metricId: U.slugId(name), name: name, unit: unitInput.value.trim(),
              step: 0.1, active: true, sortOrder: 1000 + Repo.data.bodyMetrics.length
            });
            if (!res.ok) { UI.toast(res.errors[0], 'err'); return; }
            api.close();
            UI.toast('追加しました', 'ok');
            ODL.App.refresh();
          }
        }
      ]
    });
  }

})(typeof window !== 'undefined' ? window : globalThis);
