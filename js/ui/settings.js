/* =========================================================================
 * 俺だけレベルアップ / ui/settings.js
 * 設定・種目マスタ編集・バックアップ／復元・初期化
 * ========================================================================= */
(function (global) {
  'use strict';
  var ODL = global.ODL || (global.ODL = {});
  var U = ODL.Utils;
  var C = ODL.Calculator;
  var G = ODL.GameState;
  var Repo = ODL.Repository;
  var St = ODL.Storage;
  var UI = ODL.UI;

  UI.views = UI.views || {};

  UI.views.settings = function () {
    var data = Repo.data;
    var s = data.settings;
    var root = UI.el('div');

    /* ---------------- データ ---------------- */
    var lastBackup = data.meta.lastBackupAt
      ? new Date(data.meta.lastBackupAt).toLocaleString('ja-JP')
      : 'まだ書き出していません';

    root.appendChild(UI.card('データ', [
      UI.el('div', { class: 'muted mb8', text: '最後の書き出し: ' + lastBackup }),
      UI.el('button', { class: 'btn primary block', text: '⬇ データを書き出す（バックアップ）', onclick: exportBackup }),
      UI.el('button', { class: 'btn block mt8', text: '⬆ データを読み込む（復元）', onclick: importBackup }),
      UI.el('button', { class: 'btn block ghost mt8', text: '自動バックアップの一覧', onclick: showAutoBackups }),
      UI.el('div', { class: 'hint mt8', text:
        '記録は資産です。機種変更やブラウザのデータ削除に備えて、ときどき書き出しておいてください。' +
        '復元のときは、上書き前に自動バックアップが作られます。' })
    ]));

    /* ---------------- 種目マスタ ---------------- */
    root.appendChild(UI.card('種目マスタ', [
      UI.el('div', { class: 'muted mb8', text: '有効 ' + data.activityMasters.filter(function (m) { return m.active; }).length + ' 種目 / 全 ' + data.activityMasters.length + ' 種目' }),
      UI.el('button', { class: 'btn block', text: '種目を編集する', onclick: openMasterList })
    ]));

    /* ---------------- EXP設定 ---------------- */
    root.appendChild(UI.card('EXP / レベル', [
      UI.numberSetting('EXP倍率', '全種目のEXPにかかる倍率', s.exp.expMultiplier, { step: 0.05, min: 0.05, max: 20 },
        function (v) { Repo.updateSettings({ exp: { expMultiplier: v } }); ODL.App.refresh(); }),
      UI.numberSetting('レベル係数', 'Lv = √(累積EXP ÷ 係数) + 1。大きいほど上がりにくい', s.exp.levelCoefficient, { step: 1, min: 1, max: 100000 },
        function (v) { Repo.updateSettings({ exp: { levelCoefficient: v } }); ODL.App.refresh(); }),
      UI.el('div', { class: 'hint', html: levelPreview(s) })
    ]));

    /* ---------------- ステータス成長 ---------------- */
    root.appendChild(UI.card('ステータス成長', [
      UI.numberSetting('成長係数', 'BaseGrowth = Load × この値', s.growth.growthCoefficient, { step: 0.0005, min: 0.0001, max: 1 },
        function (v) { Repo.updateSettings({ growth: { growthCoefficient: v } }); ODL.App.refresh(); }),
      UI.numberSetting('成長補正の基準値', '補正 = √(基準値 ÷ 現在値)', s.growth.statBase, { step: 1, min: 1, max: 1000 },
        function (v) { Repo.updateSettings({ growth: { statBase: v } }); ODL.App.refresh(); }),
      UI.numberSetting('補正の下限', '成長が完全に止まらないようにする下限', s.growth.minCorrection, { step: 0.05, min: 0.01, max: 1 },
        function (v) { Repo.updateSettings({ growth: { minCorrection: v } }); ODL.App.refresh(); }),
      UI.el('div', { class: 'hint', text: '※ 設定を変えても、すでに保存された記録の成長量は変わりません（過去の記録は保護されます）。' })
    ]));

    /* ---------------- ストリーク ---------------- */
    var bonusText = s.streak.bonusTable.map(function (b) {
      return b.days + '日 +' + Math.round(b.rate * 100) + '%';
    }).join(' / ');
    root.appendChild(UI.card('ストリーク', [
      UI.numberSetting('リセット日数', 'この日数だけ記録がないと途切れる', s.streak.resetAfterDays, { step: 1, min: 1, max: 30 },
        function (v) { Repo.updateSettings({ streak: { resetAfterDays: v } }); ODL.App.refresh(); }),
      UI.el('div', { class: 'kv' }, [
        UI.el('span', { class: 'k', text: 'EXPボーナス' }),
        UI.el('span', { class: 'v', style: { fontSize: '11px' }, text: bonusText })
      ]),
      UI.el('button', { class: 'btn block small ghost mt8', text: 'ボーナス表を編集', onclick: openStreakEditor })
    ]));

    /* ---------------- PB ---------------- */
    root.appendChild(UI.card('パーソナルベスト', [
      UI.switchRow('PBボーナスを有効にする', 'PB更新時にEXPを加算', UI.toggle(s.pb.enabled, function (v) {
        Repo.updateSettings({ pb: { enabled: v } }); ODL.App.refresh();
      })),
      UI.numberSetting('PBボーナス率', '0.1 = +10%', s.pb.bonus, { step: 0.01, min: 0, max: 2 },
        function (v) { Repo.updateSettings({ pb: { bonus: v } }); ODL.App.refresh(); })
    ]));

    /* ---------------- ランニング ---------------- */
    root.appendChild(UI.card('ランニング', [
      UI.numberSetting('基準ペース（分/km）', 'このペースで補正 ×1.00', s.pace.basePaceMinPerKm, { step: 0.5, min: 1, max: 30 },
        function (v) { Repo.updateSettings({ pace: { basePaceMinPerKm: v } }); ODL.App.refresh(); }),
      UI.numberSetting('補正の下限', '遅いときの下限', s.pace.minPaceFactor, { step: 0.05, min: 0.1, max: 1 },
        function (v) { Repo.updateSettings({ pace: { minPaceFactor: v } }); ODL.App.refresh(); }),
      UI.numberSetting('補正の上限', '速いときの上限', s.pace.maxPaceFactor, { step: 0.05, min: 1, max: 5 },
        function (v) { Repo.updateSettings({ pace: { maxPaceFactor: v } }); ODL.App.refresh(); })
    ]));

    /* ---------------- 表示 ---------------- */
    var labelSelect = UI.el('select', {
      onchange: function () { Repo.updateSettings({ display: { statLabel: labelSelect.value } }); ODL.App.refresh(); }
    }, [
      UI.el('option', { value: 'both', text: '略称＋日本語' }),
      UI.el('option', { value: 'abbr', text: '略称のみ（STR）' }),
      UI.el('option', { value: 'ja', text: '日本語のみ（筋力）' })
    ]);
    labelSelect.value = s.display.statLabel;

    root.appendChild(UI.card('表示', [
      UI.switchRow('ステータス表記', null, labelSelect),
      UI.numberSetting('ステータスバーの満タン基準', '表示上の目安', s.display.statBarMax, { step: 10, min: 10, max: 1000 },
        function (v) { Repo.updateSettings({ display: { statBarMax: v } }); ODL.App.refresh(); })
    ]));

    /* ---------------- 上級者向け ---------------- */
    root.appendChild(UI.card('メンテナンス', [
      UI.el('button', { class: 'btn block ghost', text: '全記録を現在の設定で再計算', onclick: recalcAll }),
      UI.el('div', { class: 'hint mt8', text:
        '係数を調整したあと、過去の記録もすべて新しい式で計算し直します。実行前に自動バックアップを作成します。' }),
      UI.el('button', { class: 'btn block ghost mt16', text: '旧形式（v0）のテストデータを書き出す', onclick: exportLegacyTest }),
      UI.el('div', { class: 'hint mt8', text:
        'migrationの動作確認用です。書き出したファイルを「データを読み込む」で復元すると、自動で現行形式へ変換されます。' })
    ]));

    /* ---------------- 初期化 ---------------- */
    root.appendChild(UI.card('データ初期化', [
      UI.el('div', { class: 'warnbox', text: 'すべてのトレーニング記録・身体データが消えます。取り消せません。実行前に必ずバックアップを書き出してください。' }),
      UI.el('button', { class: 'btn danger block mt8', text: 'データを初期化する', onclick: resetAll })
    ]));

    /* ---------------- アプリ情報 ---------------- */
    var bytes = St.estimateBytes();
    root.appendChild(UI.card('このアプリについて', [
      UI.kv('アプリ', ODL.APP_NAME + ' v' + ODL.APP_VERSION),
      UI.kv('データ形式', 'schemaVersion ' + data.schemaVersion),
      UI.kv('計算式', 'calcVersion ' + ODL.CALC_VERSION),
      UI.kv('保存先', St.driverName + (St.isPersistent() ? '' : '（一時保存）')),
      UI.kv('使用量（概算）', (bytes / 1024).toFixed(1) + ' KB'),
      UI.kv('記録数', data.trainingRecords.length + ' 件'),
      UI.kv('開始日', U.formatDateJa(data.userProfile.startDate)),
      St.isPersistent() ? null : UI.el('div', { class: 'warnbox mt8', text:
        'このブラウザでは保存領域が使えないため、データが残りません。プライベートモードを解除するか、別のブラウザをお試しください。' })
    ]));

    return root;
  };

  function levelPreview(s) {
    return [2, 5, 10, 20, 30].map(function (lv) {
      return 'Lv' + lv + ' = ' + U.fmtInt(C.expForLevel(lv, s)) + ' EXP';
    }).join(' ／ ');
  }

  /* ---------------------------------------------------------------------
   * バックアップ
   * ------------------------------------------------------------------- */
  function exportBackup() {
    var text = Repo.exportString();
    var name = Repo.backupFileName();
    var ok = UI.downloadText(name, text);
    if (ok) {
      Repo.markBackedUp();
      UI.toast('書き出しました: ' + name, 'ok', 3500);
      ODL.App.refresh();
    } else {
      /* ダウンロードできない環境向けのフォールバック */
      var ta = UI.el('textarea', { style: { minHeight: '180px', fontSize: '11px' } });
      ta.value = text;
      UI.sheet({
        title: 'バックアップ（コピーして保存してください）',
        content: [UI.el('div', { class: 'hint mb8', text: 'この端末ではファイル保存ができませんでした。下の内容をすべてコピーして、メモアプリ等に保存してください。' }), ta],
        actions: [{ label: '閉じる' }, {
          label: 'コピー', kind: 'primary', onClick: function () {
            ta.select();
            try { document.execCommand('copy'); UI.toast('コピーしました', 'ok'); }
            catch (e) { UI.toast('コピーできませんでした', 'err'); }
          }
        }]
      });
    }
  }

  function importBackup() {
    var input = UI.el('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    document.body.appendChild(input);
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      document.body.removeChild(input);
      if (!file) return;
      var reader = new FileReader();
      reader.onerror = function () { UI.toast('ファイルを読み込めませんでした', 'err'); };
      reader.onload = function () { doImport(String(reader.result)); };
      reader.readAsText(file);
    });
    input.click();
  }

  function doImport(text, allowEmpty) {
    /* 検証 → migration → 保存 まで importFromString が担当する。
       途中で失敗した場合は現在のデータに一切手を触れずに戻ってくる。 */
    var preview = Repo.importFromString(text, { allowEmpty: !!allowEmpty });
    if (!preview.ok) {
      if (preview.needsConfirmEmpty) {
        UI.confirm({
          title: '記録が0件です',
          message: 'このバックアップにはトレーニング記録が入っていません。それでも復元しますか？',
          okLabel: '復元する', danger: true
        }).then(function (ok) { if (ok) doImport(text, true); });
        return;
      }
      UI.sheet({
        title: '復元できませんでした',
        content: [
          UI.el('div', { class: 'warnbox' }, UI.el('ul', { class: 'errlist' },
            preview.errors.map(function (e) { return UI.el('li', { text: e }); }))),
          UI.el('div', { class: 'hint mt8', text: '現在のデータは変更していません。' })
        ],
        actions: [{ label: '閉じる' }]
      });
      return;
    }

    UI.toast('復元しました（記録 ' + preview.counts.training + '件）', 'ok', 3500);
    if (preview.migrated) {
      UI.toast('古い形式を自動変換しました（' + preview.steps.join(', ') + '）', 'ok', 4200);
    }
    ODL.App.refresh();
  }

  function showAutoBackups() {
    var list = Repo.listAutoBackups();
    UI.sheet({
      title: '自動バックアップ',
      content: [
        UI.el('div', { class: 'hint mb8', text: 'migration・復元・初期化・再計算の直前に自動で作られます。最大 ' + ODL.AUTO_BACKUP_KEEP + ' 件保持。' }),
        list.length ? UI.el('div', { class: 'list' }, list.map(function (b) {
          var obj = Repo.readAutoBackup(b.key);
          var count = obj && Array.isArray(obj.trainingRecords) ? obj.trainingRecords.length : '?';
          return UI.el('div', { class: 'row' }, [
            UI.el('div', { class: 'body' }, [
              UI.el('div', { class: 't', text: b.at.replace(/T/, ' ').slice(0, 19).replace(/-/g, '/') }),
              UI.el('div', { class: 's', text: '記録 ' + count + '件' })
            ]),
            UI.el('div', { class: 'end' }, [
              UI.el('button', {
                class: 'btn small', text: '復元', onclick: function () {
                  UI.confirm({
                    title: 'このバックアップから復元しますか？',
                    message: '現在のデータは、復元の直前に自動バックアップされます。',
                    okLabel: '復元する'
                  }).then(function (ok) {
                    if (!ok) return;
                    var res = Repo.restoreAutoBackup(b.key);
                    if (!res.ok) { UI.toast(res.errors[0], 'err', 4000); return; }
                    UI.closeAllSheets();
                    UI.toast('復元しました', 'ok');
                    ODL.App.refresh();
                  });
                }
              })
            ])
          ]);
        })) : UI.empty('まだありません')
      ],
      actions: [{ label: '閉じる' }]
    });
  }

  function exportLegacyTest() {
    var legacy = {
      /* schemaVersion をあえて持たせない = v0 形式 */
      records: Repo.data.trainingRecords.slice(0, 50),
      body: Repo.data.bodyRecords.slice(0, 20)
    };
    if (!legacy.records.length) {
      legacy.records = [{
        id: 'legacy-1', date: U.addDays(U.today(), -3), activityId: 'pushup',
        input: { reps: 50 }, value: 50, unit: '回', load: 28.28, exp: 28.28,
        statGrowth: { STR: 0.05, VIT: 0.02, END: 0, AGI: 0, DEX: 0 }, createdAt: U.nowIso()
      }];
    }
    var name = 'ore_dake_levelup_legacy_v0_' + U.today() + '.json';
    if (UI.downloadText(name, JSON.stringify(legacy, null, 2))) {
      UI.toast('書き出しました: ' + name, 'ok', 3500);
    } else {
      UI.toast('書き出せませんでした', 'err');
    }
  }

  function recalcAll() {
    UI.confirm({
      title: '全記録を再計算しますか？',
      message: '現在の係数設定で、過去のすべての記録のLoad・EXP・ステータス成長を計算し直します。',
      warning: '過去の記録の数値が変わります（記録そのものは消えません）。実行前に自動バックアップを作成します。',
      okLabel: '再計算する'
    }).then(function (ok) {
      if (!ok) return;
      var res = Repo.recalculateAllRecords();
      UI.toast(res.count + '件を再計算しました' + (res.skipped ? '（' + res.skipped + '件は種目不明のためスキップ）' : ''), 'ok', 3800);
      ODL.App.refresh();
    });
  }

  function resetAll() {
    UI.confirm({
      title: 'すべてのデータを初期化',
      message: 'トレーニング記録・身体データ・パーソナルベストがすべて消えます。',
      warning: 'この操作は取り消せません。直前の状態は自動バックアップに残りますが、ブラウザのデータを消すと復元できません。',
      requireText: '初期化',
      okLabel: '初期化する', danger: true
    }).then(function (ok) {
      if (!ok) return;
      Repo.resetAll(false);
      UI.toast('初期化しました', 'ok');
      ODL.App.go('home');
    });
  }

  /* ---------------------------------------------------------------------
   * ストリークボーナス表の編集
   * ------------------------------------------------------------------- */
  function openStreakEditor() {
    var rows = U.clone(Repo.data.settings.streak.bonusTable);
    var listEl = UI.el('div');

    function render() {
      UI.clear(listEl);
      rows.forEach(function (row, i) {
        var dayInput = UI.el('input', { type: 'number', min: '1', step: '1', value: row.days, inputmode: 'numeric',
          onchange: function () { rows[i].days = U.num(dayInput.value, 1); } });
        var rateInput = UI.el('input', { type: 'number', min: '0', step: '1', value: Math.round(row.rate * 100), inputmode: 'numeric',
          onchange: function () { rows[i].rate = U.num(rateInput.value, 0) / 100; } });
        listEl.appendChild(UI.el('div', { class: 'inline-3', style: { marginBottom: '8px', alignItems: 'center' } }, [
          UI.el('div', { class: 'unit-suffix' }, [dayInput, UI.el('span', { text: '日' })]),
          UI.el('div', { class: 'unit-suffix' }, [rateInput, UI.el('span', { text: '%' })]),
          UI.el('button', { class: 'btn small danger', text: '削除', onclick: function () { rows.splice(i, 1); render(); } })
        ]));
      });
    }
    render();

    UI.sheet({
      title: 'ストリークボーナス',
      content: [
        UI.el('div', { class: 'hint mb8', text: '「この日数に到達したらEXP +○%」。ステータス成長にはボーナスはかかりません。' }),
        listEl,
        UI.el('button', { class: 'btn small block ghost', text: '＋ 行を追加', onclick: function () { rows.push({ days: 1, rate: 0 }); render(); } })
      ],
      actions: [
        { label: 'キャンセル' },
        {
          label: '保存', kind: 'primary', onClick: function () {
            Repo.updateSettings({ streak: { bonusTable: rows } });
            UI.toast('保存しました', 'ok');
            ODL.App.refresh();
          }
        }
      ]
    });
  }

  /* ---------------------------------------------------------------------
   * 種目マスタ
   * ------------------------------------------------------------------- */
  function openMasterList() {
    var data = Repo.data;
    var listEl = UI.el('div', { class: 'list' }, data.activityMasters
      .slice().sort(function (a, b) { return a.sortOrder - b.sortOrder; })
      .map(function (m) {
        var count = data.trainingRecords.filter(function (r) { return r.activityId === m.activityId; }).length;
        return UI.el('div', { class: 'row tappable', onclick: function () { UI.closeAllSheets(); setTimeout(function () { openMasterForm(m); }, 200); } }, [
          UI.el('div', { class: 'icon', text: m.icon || '🏋️' }),
          UI.el('div', { class: 'body' }, [
            UI.el('div', { class: 't', html: U.escapeHtml(m.name) + (m.active ? '' : '<span class="chip" style="background:rgba(109,122,149,.2);color:var(--text-3);border-color:var(--line)">無効</span>') }),
            UI.el('div', { class: 's', text: ODL.INPUT_TYPES[m.inputType].label + ' ・ 係数 ' + m.loadCoefficient + ' ・ ' + count + '件' })
          ]),
          UI.el('div', { class: 'end' }, [UI.el('div', { class: 'sub', text: '編集 ›' })])
        ]);
      }));

    UI.sheet({
      title: '種目マスタ',
      content: [
        listEl,
        UI.el('div', { class: 'hint mt8', text: '記録のある種目は削除できません。使わなくなったら「無効」にしてください（過去の記録は残ります）。' })
      ],
      actions: [
        { label: '閉じる' },
        { label: '＋ 種目を追加', kind: 'primary', onClick: function () { setTimeout(function () { openMasterForm(null); }, 220); } }
      ]
    });
  }

  function openMasterForm(master) {
    var isNew = !master;
    var m = master ? U.clone(master) : {
      activityId: '', name: '', shortName: '', icon: '🏋️', category: 'strength',
      inputType: 'reps', unit: '回', loadCoefficient: 4.0, expCoefficient: 1.0,
      statAllocation: { STR: 100, VIT: 0, END: 0, AGI: 0, DEX: 0 },
      quickValues: [], active: true, sortOrder: (Repo.data.activityMasters.length + 1) * 10, builtIn: false
    };

    var nameInput = UI.el('input', { type: 'text', value: m.name, placeholder: '例）プランク' });
    var iconInput = UI.el('input', { type: 'text', value: m.icon, maxlength: '4', placeholder: '🏋️' });
    var unitInput = UI.el('input', { type: 'text', value: m.unit, placeholder: '回' });

    var typeSelect = UI.el('select', { onchange: function () { syncUnit(); } },
      Object.keys(ODL.INPUT_TYPES).map(function (k) {
        return UI.el('option', { value: k, text: ODL.INPUT_TYPES[k].label });
      }));
    typeSelect.value = m.inputType;

    var catSelect = UI.el('select', {}, Object.keys(ODL.CATEGORIES).map(function (k) {
      return UI.el('option', { value: k, text: ODL.CATEGORIES[k] });
    }));
    catSelect.value = m.category;

    function syncUnit() {
      var defaults = { reps: '回', weight_reps: 'kg・回', minutes: '分', distance_time: 'km' };
      unitInput.value = defaults[typeSelect.value] || unitInput.value;
      updateFormula();
    }

    var loadInput = UI.el('input', { type: 'number', step: '0.1', min: '0.01', value: m.loadCoefficient, inputmode: 'decimal', oninput: updateFormula });
    var expInput = UI.el('input', { type: 'number', step: '0.1', min: '0.01', value: m.expCoefficient, inputmode: 'decimal', oninput: updateFormula });
    var quickInput = UI.el('input', { type: 'text', value: (m.quickValues || []).join(', '), placeholder: '例）20, 50, 100' });
    var orderInput = UI.el('input', { type: 'number', step: '1', value: m.sortOrder, inputmode: 'numeric' });

    var allocInputs = {};
    var allocTotalEl = UI.el('div', { class: 'hint' });
    function updateAlloc() {
      var total = 0;
      ODL.STATS.forEach(function (k) { total += U.num(allocInputs[k].value, 0); });
      allocTotalEl.textContent = '合計 ' + U.fmt(total, 0) + '%' + (Math.abs(total - 100) > 0.01 ? '（100%でなくても自動で正規化されます）' : '');
    }
    var allocRows = ODL.STATS.map(function (k) {
      var input = UI.el('input', {
        type: 'number', step: '5', min: '0', max: '100', inputmode: 'numeric',
        value: U.num(m.statAllocation[k], 0), oninput: updateAlloc
      });
      allocInputs[k] = input;
      return UI.el('div', { class: 'switch-row' }, [
        UI.el('div', {}, [
          UI.el('div', { class: 'lb', style: { color: ODL.STAT_COLORS[k] }, text: k + ' ' + ODL.STAT_LABELS[k] })
        ]),
        UI.el('div', { class: 'ctl unit-suffix', style: { width: '110px' } }, [input, UI.el('span', { text: '%' })])
      ]);
    });

    var formulaEl = UI.el('div', { class: 'hint' });
    function updateFormula() {
      var lc = U.num(loadInput.value, 1);
      var t = typeSelect.value;
      var f = {
        reps: 'Load = ' + lc + ' × √(回数)',
        weight_reps: 'Load = ' + lc + ' × √(重量 × 回数)',
        minutes: 'Load = ' + lc + ' × √(分)',
        distance_time: 'Load = 距離 × ' + lc + ' × ペース補正'
      }[t];
      var samples = {
        reps: [[10, '10回'], [50, '50回'], [100, '100回']],
        weight_reps: [[null, '30kg×20回'], [null, '40kg×30回']],
        minutes: [[5, '5分'], [10, '10分'], [30, '30分']],
        distance_time: [[null, '3km(6分/km)'], [null, '5km(6分/km)'], [null, '10km(6分/km)']]
      }[t];
      var fake = { loadCoefficient: lc, inputType: t };
      var exs = [];
      if (t === 'reps') { [10, 50, 100].forEach(function (n) { exs.push(n + '回 → ' + U.fmt(C.calculateLoad(fake, { reps: n }, Repo.data.settings).load, 1)); }); }
      else if (t === 'weight_reps') { [[30, 20], [40, 30]].forEach(function (p) { exs.push(p[0] + 'kg×' + p[1] + '回 → ' + U.fmt(C.calculateLoad(fake, { weight: p[0], reps: p[1] }, Repo.data.settings).load, 1)); }); }
      else if (t === 'minutes') { [5, 10, 30].forEach(function (n) { exs.push(n + '分 → ' + U.fmt(C.calculateLoad(fake, { minutes: n }, Repo.data.settings).load, 1)); }); }
      else { [3, 5, 10].forEach(function (n) { exs.push(n + 'km → ' + U.fmt(C.calculateLoad(fake, { distance: n }, Repo.data.settings).load, 1)); }); }
      formulaEl.innerHTML = U.escapeHtml(f) + '<br>例: ' + U.escapeHtml(exs.join(' ／ '));
    }
    updateAlloc();
    updateFormula();

    var content = [
      UI.el('div', { class: 'inline-2' }, [
        UI.el('div', { class: 'field' }, [UI.el('label', { text: 'アイコン' }), iconInput]),
        UI.el('div', { class: 'field' }, [UI.el('label', { text: '並び順' }), orderInput])
      ]),
      UI.el('div', { class: 'field' }, [UI.el('label', { text: '種目名' }), nameInput]),
      UI.el('div', { class: 'field' }, [UI.el('label', { text: '入力方式' }), typeSelect]),
      UI.el('div', { class: 'inline-2' }, [
        UI.el('div', { class: 'field' }, [UI.el('label', { text: '単位' }), unitInput]),
        UI.el('div', { class: 'field' }, [UI.el('label', { text: 'カテゴリ' }), catSelect])
      ]),
      UI.el('div', { class: 'inline-2' }, [
        UI.el('div', { class: 'field' }, [UI.el('label', { text: '負荷係数' }), loadInput]),
        UI.el('div', { class: 'field' }, [UI.el('label', { text: 'EXP係数' }), expInput])
      ]),
      formulaEl,
      UI.el('div', { class: 'field mt16' }, [UI.el('label', { text: 'クイック入力（カンマ区切り）' }), quickInput]),
      UI.el('div', { class: 'section-title', text: 'ステータス配分' }),
      UI.el('div', {}, allocRows),
      allocTotalEl
    ];

    var actions = [{ label: 'キャンセル' }];
    if (!isNew) {
      actions.push({
        label: m.active ? '無効にする' : '有効にする', keepOpen: true,
        onClick: function (api) {
          Repo.setActivityActive(m.activityId, !m.active);
          api.close();
          UI.toast(m.active ? '無効にしました' : '有効にしました', 'ok');
          ODL.App.refresh();
        }
      });
    }
    actions.push({
      label: '保存', kind: 'primary', keepOpen: true, onClick: function (api) {
        var alloc = {};
        ODL.STATS.forEach(function (k) { alloc[k] = U.num(allocInputs[k].value, 0); });
        var payload = {
          activityId: m.activityId || U.slugId(nameInput.value || 'activity'),
          name: nameInput.value.trim(),
          shortName: nameInput.value.trim(),
          icon: iconInput.value.trim() || '🏋️',
          category: catSelect.value,
          inputType: typeSelect.value,
          unit: unitInput.value.trim(),
          loadCoefficient: U.num(loadInput.value, 0),
          expCoefficient: U.num(expInput.value, 0),
          statAllocation: alloc,
          quickValues: quickInput.value.split(',').map(function (v) { return U.num(v, 0); }).filter(function (v) { return v > 0; }),
          active: m.active !== false,
          sortOrder: U.num(orderInput.value, 100),
          builtIn: m.builtIn
        };
        var res = Repo.upsertActivityMaster(payload);
        if (!res.ok) {
          UI.sheet({ title: '保存できません', content: UI.el('ul', { class: 'errlist' },
            res.errors.map(function (e) { return UI.el('li', { text: e }); })), actions: [{ label: '閉じる' }] });
          return;
        }
        api.close();
        UI.toast('保存しました', 'ok');
        ODL.App.refresh();
      }
    });

    UI.sheet({ title: isNew ? '種目を追加' : '種目を編集', content: content, actions: actions });
  }

})(typeof window !== 'undefined' ? window : globalThis);
