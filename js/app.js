/* =========================================================================
 * 俺だけレベルアップ / app.js
 * 画面の組み立て・ルーティング・起動処理・PWA登録
 * ========================================================================= */
(function (global) {
  'use strict';
  var ODL = global.ODL || (global.ODL = {});
  var U = ODL.Utils;
  var Repo = ODL.Repository;
  var UI = ODL.UI;

  var TABS = [
    { id: 'home',     label: 'ホーム',   icon: '🏠', title: '俺だけレベルアップ' },
    { id: 'history',  label: '履歴',     icon: '📅', title: '履歴・カレンダー' },
    { id: 'status',   label: 'ステータス', icon: '📊', title: 'ステータス' },
    { id: 'body',     label: '身体',     icon: '📏', title: '身体データ' },
    { id: 'settings', label: '設定',     icon: '⚙️', title: '設定' }
  ];

  var current = 'home';
  var mounted = false;

  var App = ODL.App = {

    boot: function () {
      var status = Repo.load();

      if (status.state === 'corrupt') { renderRecovery(status, 'corrupt'); return; }
      if (status.state === 'migration_failed') { renderRecovery(status, 'migration'); return; }

      renderShell();
      App.go('home');

      if (status.state === 'readonly') {
        UI.toast('データを保存できませんでした。ブラウザの設定をご確認ください。', 'err', 6000);
      }
      if (status.migrated) {
        UI.toast('データ形式を更新しました（' + status.steps.join(', ') + '）。記録はそのまま引き継がれています。', 'ok', 5000);
      }
      registerServiceWorker();

      /* ホーム画面のショートカットから起動された場合 */
      try {
        if (/[?&]action=record\b/.test(location.search)) {
          setTimeout(function () { UI.openRecordSheet({}); }, 320);
        }
      } catch (e) { /* noop */ }
    },

    go: function (tab) {
      if (!TABS.some(function (t) { return t.id === tab; })) tab = 'home';
      current = tab;
      App.refresh();
      try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch (e) { window.scrollTo(0, 0); }
    },

    refresh: function () {
      if (!mounted) return;
      var main = document.getElementById('main');
      var view = UI.views[current];
      UI.clear(main);
      try {
        main.appendChild(view());
      } catch (e) {
        console.error(e);
        main.appendChild(UI.el('div', { class: 'warnbox', text: '画面の表示中に問題が発生しました。アプリを再読み込みしてください。記録は保存されています。' }));
      }

      var tabbar = document.getElementById('tabbar');
      Array.prototype.forEach.call(tabbar.children, function (btn) {
        btn.classList.toggle('active', btn.dataset.tab === current);
      });

      var meta = TABS.filter(function (t) { return t.id === current; })[0];
      document.getElementById('appbar-title').textContent = meta.title;

      var st = Repo.state();
      document.getElementById('lvchip').textContent = 'Lv.' + st.level;

      var fab = document.getElementById('fab');
      fab.style.display = (current === 'home') ? 'none' : 'flex';
    },

    get currentTab() { return current; }
  };

  /* ---------------------------------------------------------------------
   * シェル
   * ------------------------------------------------------------------- */
  function renderShell() {
    var app = document.getElementById('app');
    UI.clear(app);

    var bar = UI.el('header', { class: 'appbar' }, [
      UI.el('h1', { id: 'appbar-title', text: ODL.APP_NAME }),
      UI.el('span', { class: 'lvchip', id: 'lvchip', text: 'Lv.1' })
    ]);

    var main = UI.el('main', { id: 'main' });

    var tabbar = UI.el('nav', { class: 'tabbar', id: 'tabbar' }, TABS.map(function (t) {
      return UI.el('button', {
        dataset: { tab: t.id },
        onclick: function () { App.go(t.id); }
      }, [
        UI.el('span', { class: 'ic', text: t.icon }),
        UI.el('span', { text: t.label })
      ]);
    }));

    var fab = UI.el('button', {
      class: 'fab', id: 'fab', text: '＋', 'aria-label': '記録する',
      onclick: function () { UI.openRecordSheet({}); }
    });

    app.appendChild(bar);
    app.appendChild(main);
    app.appendChild(fab);
    app.appendChild(tabbar);

    if (!document.getElementById('toast-host')) {
      document.body.appendChild(UI.el('div', { id: 'toast-host' }));
    }
    mounted = true;
  }

  /* ---------------------------------------------------------------------
   * 復旧画面（データが壊れている / migration失敗）
   *   ここでは絶対に自動で上書き・初期化しない。ユーザーが選ぶ。
   * ------------------------------------------------------------------- */
  function renderRecovery(status, kind) {
    var app = document.getElementById('app');
    UI.clear(app);
    if (!document.getElementById('toast-host')) {
      document.body.appendChild(UI.el('div', { id: 'toast-host' }));
    }

    var title = kind === 'corrupt'
      ? '保存データを読み込めませんでした'
      : 'データ形式の更新に失敗しました';
    var lead = kind === 'corrupt'
      ? '保存されているデータが壊れている可能性があります。念のため、元のデータには一切手を加えていません。'
      : '古い形式のデータを新しい形式へ変換できませんでした。元のデータはそのまま残してあります。';

    var box = UI.el('div', { class: 'boot-error' }, [
      UI.el('h2', { text: '⚠ ' + title }),
      UI.el('p', { text: lead }),
      UI.el('div', { class: 'note', text: '詳細: ' + (status.error || '不明') +
        (status.fromVersion !== undefined ? '（schemaVersion ' + status.fromVersion + ' → ' + status.toVersion + '）' : '') })
    ]);

    var backups = status.backups || Repo.listAutoBackups();
    if (backups.length) {
      box.appendChild(UI.el('div', { class: 'section-title', text: '自動バックアップから復元' }));
      box.appendChild(UI.el('div', { class: 'list' }, backups.map(function (b) {
        var obj = Repo.readAutoBackup(b.key);
        var count = obj && Array.isArray(obj.trainingRecords) ? obj.trainingRecords.length :
                    (obj && Array.isArray(obj.records) ? obj.records.length : '?');
        return UI.el('div', { class: 'row' }, [
          UI.el('div', { class: 'body' }, [
            UI.el('div', { class: 't', text: b.at.replace(/T/, ' ').slice(0, 19).replace(/-/g, '/') }),
            UI.el('div', { class: 's', text: '記録 ' + count + '件' })
          ]),
          UI.el('div', { class: 'end' }, [
            UI.el('button', {
              class: 'btn small primary', text: '復元', onclick: function () {
                var raw = ODL.Storage.readRaw(b.key);
                if (!raw) { UI.toast('バックアップを読み込めませんでした', 'err'); return; }
                /* まだ data が無い状態なので、まっさらから読み込む */
                Repo.quarantineAndStartFresh();
                var res = Repo.importFromString(raw, { allowEmpty: true });
                if (!res.ok) { UI.toast(res.errors[0], 'err', 5000); return; }
                renderShell(); App.go('home');
                UI.toast('復元しました', 'ok', 4000);
              }
            })
          ])
        ]);
      })));
    }

    box.appendChild(UI.el('div', { class: 'section-title', text: 'バックアップファイルから復元' }));
    box.appendChild(UI.el('button', {
      class: 'btn primary block', text: '⬆ JSONファイルを選んで復元',
      onclick: function () {
        var input = UI.el('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
        document.body.appendChild(input);
        input.addEventListener('change', function () {
          var file = input.files && input.files[0];
          document.body.removeChild(input);
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function () {
            Repo.quarantineAndStartFresh();
            var res = Repo.importFromString(String(reader.result), { allowEmpty: true });
            if (!res.ok) { UI.toast(res.errors[0], 'err', 5000); return; }
            renderShell(); App.go('home');
            UI.toast('復元しました', 'ok', 4000);
          };
          reader.onerror = function () { UI.toast('ファイルを読み込めませんでした', 'err'); };
          reader.readAsText(file);
        });
        input.click();
      }
    }));

    box.appendChild(UI.el('div', { class: 'section-title', text: 'それでも解決しない場合' }));
    box.appendChild(UI.el('div', { class: 'warnbox', text:
      '「新しく始める」を選ぶと、読み込めなかったデータは自動バックアップへ退避したうえで、空の状態からスタートします。退避したデータはブラウザのデータを消すまで残ります。' }));
    box.appendChild(UI.el('button', {
      class: 'btn danger block mt8', text: '新しく始める（退避してリセット）',
      onclick: function () {
        UI.confirm({
          title: '新しく始めますか？',
          message: '読み込めなかったデータを退避し、空の状態でアプリを開始します。',
          requireText: 'はじめる', okLabel: '実行する', danger: true
        }).then(function (ok) {
          if (!ok) return;
          Repo.quarantineAndStartFresh();
          renderShell(); App.go('home');
        });
      }
    }));

    app.appendChild(box);
  }

  /* ---------------------------------------------------------------------
   * PWA
   * ------------------------------------------------------------------- */
  function registerServiceWorker() {
    if (global.ODL_DISABLE_SW) return;   /* 単一HTML版ではSWを使わない */
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
    try {
      navigator.serviceWorker.register('sw.js').catch(function () { /* オフライン機能なしでも動作する */ });
    } catch (e) { /* noop */ }
  }

  /* 起動 */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { App.boot(); });
  } else {
    App.boot();
  }

})(typeof window !== 'undefined' ? window : globalThis);
