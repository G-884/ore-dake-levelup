/* =========================================================================
 * 俺だけレベルアップ / ui/record.js
 * トレーニング記録の入力シートと、記録後のゲーム的フィードバック
 *   ① 種目選択 → ② 数値入力 → ③ 保存
 * ========================================================================= */
(function (global) {
  'use strict';
  var ODL = global.ODL || (global.ODL = {});
  var U = ODL.Utils;
  var C = ODL.Calculator;
  var G = ODL.GameState;
  var Repo = ODL.Repository;
  var UI = ODL.UI;

  var FIELD_META = {
    reps:        { label: '回数', unit: '回', step: 1, inputmode: 'numeric' },
    weight:      { label: '重量', unit: 'kg', step: 0.5, inputmode: 'decimal' },
    minutes:     { label: '時間', unit: '分', step: 1, inputmode: 'numeric' },
    distance:    { label: '距離', unit: 'km', step: 0.1, inputmode: 'decimal' },
    durationMin: { label: 'タイム（任意）', unit: '分', step: 1, inputmode: 'decimal' }
  };

  /* ---------------------------------------------------------------------
   * 入口
   * ------------------------------------------------------------------- */
  UI.openRecordSheet = function (options) {
    options = options || {};
    var data = Repo.data;
    var state = Repo.state();

    if (options.record) {            /* 編集モード */
      openForm(options.record.activityId, options, null);
      return;
    }

    var actives = (data.activityMasters || [])
      .filter(function (m) { return m.active; })
      .sort(function (a, b) { return a.sortOrder - b.sortOrder; });

    if (!actives.length) {
      UI.toast('有効な種目がありません。設定 → 種目マスタで追加してください。', 'err', 3800);
      return;
    }

    var sheet = UI.sheet({
      title: '何をやった？',
      content: UI.el('div', { class: 'grid-2' }, actives.map(function (m) {
        var pb = state.pbs[m.activityId];
        return UI.el('button', {
          class: 'act-tile',
          onclick: function () { sheet.close(); openForm(m.activityId, options, null); }
        }, [
          UI.el('div', { class: 'em', text: m.icon || '🏋️' }),
          UI.el('div', { class: 'nm', text: m.name }),
          UI.el('div', { class: 'pb', text: pb ? 'PB ' + UI.pbSummary(pb, true) : '記録なし' })
        ]);
      }))
    });
  };

  /* ---------------------------------------------------------------------
   * 入力フォーム
   * ------------------------------------------------------------------- */
  function openForm(activityId, options, presetInput) {
    var data = Repo.data;
    var master = G.findMaster(data, activityId);
    if (!master) { UI.toast('種目が見つかりません', 'err'); return; }

    var editing = options.record || null;
    var state = Repo.state();
    var pb = state.pbs[activityId];

    var fields = (ODL.INPUT_TYPES[master.inputType] || ODL.INPUT_TYPES.reps).fields;
    var inputs = {};
    var content = [];

    /* 日付 */
    var dateInput = UI.el('input', {
      type: 'date',
      value: editing ? editing.date : (options.date || U.today()),
      max: U.addDays(U.today(), 0)
    });
    content.push(UI.el('div', { class: 'field' }, [
      UI.el('label', { text: '日付' }), dateInput
    ]));

    /* 数値入力 */
    fields.forEach(function (f) {
      var initial = '';
      if (editing && editing.input && editing.input[f] !== undefined) initial = editing.input[f];
      else if (presetInput && presetInput[f] !== undefined) initial = presetInput[f];

      /* タイムだけは「分」「秒」の2欄で入力する（22分30秒を22.5と打たなくてよいように） */
      if (f === 'durationMin') {
        var split = (initial !== '' && U.num(initial, 0) > 0)
          ? C.splitMinutes(initial) : { minutes: '', seconds: '' };

        var minInput = UI.el('input', {
          type: 'number', step: '1', min: '0', inputmode: 'numeric',
          placeholder: '0', value: split.minutes, oninput: updatePreview
        });
        var secInput = UI.el('input', {
          type: 'number', step: '1', min: '0', max: '59', inputmode: 'numeric',
          placeholder: '00', value: split.seconds, oninput: updatePreview
        });
        inputs[f] = {
          read: function () {
            var hasMin = String(minInput.value).trim() !== '';
            var hasSec = String(secInput.value).trim() !== '';
            if (!hasMin && !hasSec) return '';
            var mm = hasMin ? U.num(minInput.value, 0) : 0;
            var ss = hasSec ? U.num(secInput.value, 0) : 0;
            if (mm < 0 || ss < 0) return -1;
            return C.joinMinutes(mm, ss);
          },
          focus: function () { try { minInput.focus(); } catch (e) {} }
        };

        content.push(UI.el('div', { class: 'field' }, [
          UI.el('label', { text: 'タイム（任意）' }),
          UI.el('div', { class: 'inline-2' }, [
            UI.el('div', { class: 'unit-suffix' }, [minInput, UI.el('span', { text: '分' })]),
            UI.el('div', { class: 'unit-suffix' }, [secInput, UI.el('span', { text: '秒' })])
          ]),
          UI.el('div', { class: 'hint', text:
            '例）22分30秒 →「22」と「30」。未入力でも記録できますが、入力するとペース補正とベストペースの判定に使われます（基準 ' +
            U.fmt(data.settings.pace.basePaceMinPerKm, 0) + '分/km）。' })
        ]));
        return;
      }

      var meta = FIELD_META[f];
      var input = UI.el('input', {
        type: 'number', step: meta.step, min: '0', inputmode: meta.inputmode,
        placeholder: '0', value: initial,
        oninput: updatePreview
      });
      inputs[f] = {
        read: function () { return input.value; },
        focus: function () { try { input.focus(); } catch (e) {} }
      };

      var wrap = UI.el('div', { class: 'field' }, [
        UI.el('label', { text: meta.label }),
        UI.el('div', { class: 'unit-suffix' }, [input, UI.el('span', { text: meta.unit })])
      ]);

      /* よく使う値のクイックボタン */
      if (f === fields[0] && master.quickValues && master.quickValues.length) {
        var quick = UI.el('div', { class: 'quick' }, master.quickValues.map(function (v) {
          return UI.el('button', {
            type: 'button', text: v + (master.inputType === 'distance_time' ? 'km' : (master.inputType === 'minutes' ? '分' : '回')),
            onclick: function () { input.value = v; updatePreview(); }
          });
        }));
        wrap.appendChild(quick);
      }
      content.push(wrap);
    });

    /* メモ */
    var noteInput = UI.el('input', { type: 'text', maxlength: '120', placeholder: '（任意）', value: editing ? editing.note : '' });
    content.push(UI.el('div', { class: 'field' }, [UI.el('label', { text: 'メモ' }), noteInput]));

    /* プレビュー */
    var preview = UI.el('div', { class: 'card tight', style: { marginBottom: '0' } });
    content.push(preview);

    if (pb && !editing) {
      content.push(UI.el('div', { class: 'hint', style: { marginTop: '8px' }, text: '現在のベスト: ' + UI.pbSummary(pb) }));
    }

    var sheet = UI.sheet({
      title: (editing ? '記録を編集 — ' : '') + (master.icon || '') + ' ' + master.name,
      content: content,
      actions: [
        { label: 'キャンセル' },
        {
          label: editing ? '更新する' : '保存する', kind: 'primary', keepOpen: true,
          onClick: function (api) { submit(api); }
        }
      ]
    });

    /* 最初の入力欄にフォーカス（モバイルではキーボードが出るので編集時のみ） */
    setTimeout(function () {
      if (!editing) return;
      try { inputs[fields[0]].focus(); } catch (e) {}
    }, 300);

    updatePreview();

    function collect() {
      var obj = {};
      fields.forEach(function (f) { obj[f] = inputs[f].read(); });
      return obj;
    }

    function updatePreview() {
      UI.clear(preview);
      var raw = collect();
      var input = {};
      fields.forEach(function (f) {
        var n = U.num(raw[f], NaN);
        if (isFinite(n) && n > 0) input[f] = n;
      });
      var v = C.validateInput(master, input);
      if (!v.ok) {
        preview.appendChild(UI.el('div', { class: 'muted', text: '数値を入力すると獲得EXPの目安が表示されます。' }));
        return;
      }

      var date = dateInput.value || U.today();
      var pseudo = { id: editing ? editing.id : null, date: date, createdAt: editing ? editing.createdAt : U.nowIso() };
      var withoutSelf = editing
        ? data.trainingRecords.filter(function (r) { return r.id !== editing.id; })
        : data.trainingRecords;

      var backup = data.trainingRecords;
      data.trainingRecords = withoutSelf;
      var snap, built;
      try {
        snap = G.snapshotBefore(data, pseudo);
        built = G.buildRecord(data, { activityId: activityId, date: date, input: input }, snap);
      } catch (e) {
        data.trainingRecords = backup;
        preview.appendChild(UI.el('div', { class: 'muted', text: '計算できませんでした。' }));
        return;
      }
      data.trainingRecords = backup;

      var rows = [
        UI.kv('負荷 Load', U.fmt(built.load, 1)),
        UI.kv('獲得EXP（予想）', '<span style="color:var(--accent)">+' + U.fmtInt(built.exp) + '</span>')
      ];
      if (built.expBreakdown.streakRate > 0) {
        rows.push(UI.kv('ストリークボーナス', '+' + Math.round(built.expBreakdown.streakRate * 100) + '%'));
      }
      if (built.isPersonalBest) {
        var hitNames = (built.expBreakdown.pbHits || []).map(function (h) { return h.label; }).join('・');
        rows.push(UI.kv('PBボーナス', '<span style="color:var(--gold)">+' + Math.round(built.expBreakdown.pbRate * 100) + '%  🎉 ' + U.escapeHtml(hitNames) + '</span>'));
      }
      if (built.expBreakdown.paceFactor && built.expBreakdown.pace) {
        rows.push(UI.kv('ペース', C.formatPace(built.expBreakdown.pace) + '（補正 ×' + U.fmt(built.expBreakdown.paceFactor, 2) + '）'));
      }
      var growth = ODL.STATS.filter(function (s) { return built.statGrowth[s] > 0; })
        .map(function (s) { return s + ' +' + U.fmt(built.statGrowth[s], 2); }).join('  ');
      if (growth) rows.push(UI.kv('ステータス成長', growth));

      UI.append(preview, rows);
    }

    function submit(api) {
      var raw = collect();
      var input = {};
      fields.forEach(function (f) {
        if (raw[f] === '' || raw[f] === null || raw[f] === undefined) return;
        input[f] = U.num(raw[f], 0);
      });

      var date = dateInput.value;
      if (!U.isDateStr(date)) { UI.toast('日付を選んでください', 'err'); return; }
      if (U.diffDays(date, U.today()) < 0) { UI.toast('未来の日付は記録できません', 'err'); return; }

      var params = { activityId: activityId, date: date, input: input, note: noteInput.value.trim() };
      var res = editing ? Repo.updateTrainingRecord(editing.id, params) : Repo.addTrainingRecord(params);

      if (!res.ok) {
        UI.toast(res.errors[0], 'err', 3200);
        return;
      }
      if (res.saveResult && !res.saveResult.ok) {
        UI.toast(saveErrorMessage(res.saveResult.error), 'err', 5000);
      }

      api.close();
      if (editing) {
        UI.toast('記録を更新しました', 'ok');
        if (typeof options.onSaved === 'function') options.onSaved(res);
        ODL.App.refresh();
      } else {
        ODL.App.refresh();
        showResult(res, master);
        if (typeof options.onSaved === 'function') options.onSaved(res);
      }
    }
  }

  function saveErrorMessage(code) {
    if (code === 'QUOTA_EXCEEDED') return '端末の保存容量がいっぱいです。設定からバックアップを書き出してください。';
    return '保存に失敗しました。設定からバックアップを書き出して、ブラウザの空き容量を確認してください。';
  }
  UI.saveErrorMessage = saveErrorMessage;

  /* ---------------------------------------------------------------------
   * 記録後のフィードバック
   * ------------------------------------------------------------------- */
  function showResult(res, master) {
    var rec = res.record;
    var backdrop = UI.el('div', { class: 'result-backdrop' });
    var box = UI.el('div', { class: 'result' });

    box.appendChild(UI.el('div', { class: 'actname', text: (master.icon || '') + ' ' + master.name + ' ' + C.displayValue(master, rec) }));
    box.appendChild(UI.el('div', { class: 'exp', html: '+' + U.fmtInt(rec.exp) + '<small>EXP</small>' }));

    var growths = ODL.STATS.filter(function (s) { return rec.statGrowth[s] > 0; });
    if (growths.length) {
      box.appendChild(UI.el('div', { class: 'growths' }, growths.map(function (s) {
        return UI.el('div', {}, [
          UI.el('span', { style: { color: ODL.STAT_COLORS[s] }, text: s + ' ' + ODL.STAT_LABELS[s] }),
          UI.el('span', { style: { color: ODL.STAT_COLORS[s] }, text: '+' + U.fmt(rec.statGrowth[s], 2) })
        ]);
      })));
    }

    if (rec.isPersonalBest) {
      var hits = rec.expBreakdown && rec.expBreakdown.pbHits ? rec.expBreakdown.pbHits : [];
      box.appendChild(UI.el('div', { class: 'banner pb' }, [
        UI.el('div', { text: '🎉 PERSONAL BEST!' }),
        hits.length ? UI.el('div', {
          style: { fontSize: '12px', fontWeight: '700', marginTop: '4px', letterSpacing: '0' },
          text: hits.map(function (h) { return h.label + ' ' + h.text; }).join('　/　')
        }) : null
      ]));
    }
    if (res.levelUp) {
      box.appendChild(UI.el('div', { class: 'banner lvup', text: '⬆ LEVEL UP!  Lv.' + res.levelBefore + ' → Lv.' + res.levelAfter }));
    }
    if (res.streak && res.streak.current > 0) {
      box.appendChild(UI.el('div', { class: 'streak', text: '🔥 ストリーク ' + res.streak.current + '日（トレ' + res.streak.activeDays + '日）' }));
    }

    var notes = [];
    if (rec.expBreakdown.streakRate > 0) notes.push('ストリーク +' + Math.round(rec.expBreakdown.streakRate * 100) + '%');
    if (rec.expBreakdown.pbRate > 0) notes.push('PB +' + Math.round(rec.expBreakdown.pbRate * 100) + '%');
    notes.push('Load ' + U.fmt(rec.load, 1));
    box.appendChild(UI.el('div', { class: 'bonus-note', text: notes.join(' ／ ') }));

    var st = res.state;
    box.appendChild(UI.el('div', { class: 'exp-text', style: { marginTop: '14px', fontSize: '12px', color: 'var(--text-3)' },
      text: 'Lv.' + st.level + '  次まで ' + U.fmtInt(st.levelInfo.remaining) + ' EXP' }));
    box.appendChild(UI.el('div', { class: 'expbar', style: { marginTop: '6px' } }, [
      UI.el('i', { style: { width: (st.levelInfo.progress * 100) + '%' } })
    ]));

    var close = function () {
      backdrop.style.transition = 'opacity .2s';
      backdrop.style.opacity = '0';
      setTimeout(function () { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); }, 210);
    };

    box.appendChild(UI.el('div', { style: { display: 'flex', gap: '8px', marginTop: '18px' } }, [
      UI.el('button', { class: 'btn block', text: '続けて記録', onclick: function () { close(); UI.openRecordSheet({ date: rec.date }); } }),
      UI.el('button', { class: 'btn primary block', text: 'OK', onclick: close })
    ]));

    backdrop.appendChild(box);
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
    document.body.appendChild(backdrop);
  }

})(typeof window !== 'undefined' ? window : globalThis);
