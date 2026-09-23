/* =========================================================================
 * 俺だけレベルアップ / ui/common.js
 * DOM生成・シート・トースト・確認ダイアログなどの共通UI部品
 * ========================================================================= */
(function (global) {
  'use strict';
  var ODL = global.ODL || (global.ODL = {});
  var U = ODL.Utils;
  var UI = ODL.UI = ODL.UI || {};

  /* ---------------- DOM ---------------- */
  UI.el = function (tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') e.className = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
        else if (k.indexOf('on') === 0 && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.keys(v).forEach(function (d) { e.dataset[d] = v[d]; });
        else e.setAttribute(k, v === true ? '' : v);
      });
    }
    UI.append(e, children);
    return e;
  };

  UI.append = function (parent, children) {
    if (children === null || children === undefined || children === false) return parent;
    if (Array.isArray(children)) {
      children.forEach(function (c) { UI.append(parent, c); });
      return parent;
    }
    if (children instanceof Node) parent.appendChild(children);
    else parent.appendChild(document.createTextNode(String(children)));
    return parent;
  };

  UI.clear = function (node) { while (node.firstChild) node.removeChild(node.firstChild); return node; };

  UI.$ = function (sel, root) { return (root || document).querySelector(sel); };

  /* ---------------- ステータス表記 ---------------- */
  UI.statLabel = function (stat, settings) {
    var mode = (settings && settings.display && settings.display.statLabel) || 'both';
    var ja = ODL.STAT_LABELS[stat];
    if (mode === 'ja') return ja;
    if (mode === 'abbr') return stat;
    return stat;   /* both: 略称を主、日本語は副ラベルで出す */
  };
  UI.statSubLabel = function (stat, settings) {
    var mode = (settings && settings.display && settings.display.statLabel) || 'both';
    if (mode === 'both') return ODL.STAT_LABELS[stat];
    return null;
  };

  /* ---------------- トースト ---------------- */
  UI.toast = function (message, kind, ms) {
    var host = document.getElementById('toast-host');
    if (!host) return;
    var t = UI.el('div', { class: 'toast' + (kind ? ' ' + kind : ''), text: message });
    host.appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity .25s, transform .25s';
      t.style.opacity = '0';
      t.style.transform = 'translateY(8px)';
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 260);
    }, ms || 2400);
  };

  /* ---------------- シート（ボトムモーダル） ---------------- */
  var openSheets = [];

  UI.sheet = function (opts) {
    var backdrop = UI.el('div', { class: 'sheet-backdrop' });
    var sheet = UI.el('div', { class: 'sheet' });
    backdrop.appendChild(sheet);

    sheet.appendChild(UI.el('div', { class: 'grip' }));
    if (opts.title) sheet.appendChild(UI.el('h2', { text: opts.title }));
    if (opts.content) UI.append(sheet, opts.content);

    var api = {
      root: sheet,
      close: function () {
        if (!backdrop.parentNode) return;
        backdrop.style.transition = 'opacity .18s';
        backdrop.style.opacity = '0';
        setTimeout(function () {
          if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        }, 190);
        openSheets = openSheets.filter(function (s) { return s !== api; });
        if (typeof opts.onClose === 'function') opts.onClose();
      }
    };

    if (opts.actions) {
      var bar = UI.el('div', { class: 'sheet-actions' });
      opts.actions.forEach(function (a) {
        bar.appendChild(UI.el('button', {
          class: 'btn ' + (a.kind || ''), text: a.label,
          onclick: function () {
            if (typeof a.onClick === 'function') { if (a.onClick(api) === false) return; }
            if (a.keepOpen !== true) api.close();
          }
        }));
      });
      sheet.appendChild(bar);
    }

    backdrop.addEventListener('click', function (ev) {
      if (ev.target === backdrop && opts.dismissible !== false) api.close();
    });

    document.body.appendChild(backdrop);
    openSheets.push(api);
    return api;
  };

  UI.closeAllSheets = function () {
    openSheets.slice().forEach(function (s) { s.close(); });
  };

  /* ---------------- 確認ダイアログ ---------------- */
  UI.confirm = function (opts) {
    return new Promise(function (resolve) {
      var body = [];
      if (opts.message) body.push(UI.el('p', { class: 'muted', style: { fontSize: '14px', lineHeight: '1.7', color: 'var(--text-2)' }, text: opts.message }));
      if (opts.warning) body.push(UI.el('div', { class: 'warnbox', text: opts.warning }));

      var confirmInput = null;
      if (opts.requireText) {
        confirmInput = UI.el('input', { type: 'text', placeholder: opts.requireText, autocapitalize: 'off', autocorrect: 'off' });
        body.push(UI.el('div', { class: 'field mt16' }, [
          UI.el('label', { text: '確認のため「' + opts.requireText + '」と入力してください' }),
          confirmInput
        ]));
      }

      var decided = false;
      UI.sheet({
        title: opts.title || '確認',
        content: body,
        onClose: function () { if (!decided) resolve(false); },
        actions: [
          { label: opts.cancelLabel || 'キャンセル', onClick: function () { decided = true; resolve(false); } },
          {
            label: opts.okLabel || 'OK',
            kind: opts.danger ? 'danger' : 'primary',
            onClick: function () {
              if (confirmInput && confirmInput.value.trim() !== opts.requireText) {
                UI.toast('入力が一致しません', 'err');
                return false;
              }
              decided = true; resolve(true);
            }
          }
        ]
      });
    });
  };

  /* ---------------- 汎用パーツ ---------------- */
  UI.card = function (title, children, extra) {
    var c = UI.el('div', { class: 'card' + (extra && extra.tight ? ' tight' : '') });
    if (title) {
      var h = UI.el('div', { class: 'card-title' });
      h.appendChild(UI.el('span', { text: title }));
      if (extra && extra.action) h.appendChild(extra.action);
      c.appendChild(h);
    }
    UI.append(c, children);
    return c;
  };

  UI.empty = function (text) { return UI.el('div', { class: 'empty', text: text }); };

  /* PBを1行にまとめる。複数指標（最長距離・ベストペースなど）があれば並べる */
  UI.pbSummary = function (pb, short) {
    if (!pb) return '';
    var metrics = pb.metrics ? Object.keys(pb.metrics).map(function (k) { return pb.metrics[k]; }) : [];
    if (!metrics.length) return pb.label + (short ? '' : '（' + ODL.Utils.formatDateJa(pb.date) + '）');
    return metrics.map(function (m) {
      return short ? m.text : m.label + ' ' + m.text + '（' + ODL.Utils.formatDateJa(m.date) + '）';
    }).join(short ? ' / ' : '　');
  };

  UI.metric = function (value, label, cls) {
    return UI.el('div', { class: 'metric ' + (cls || '') }, [
      UI.el('div', { class: 'v', html: value }),
      UI.el('div', { class: 'k', text: label })
    ]);
  };

  UI.kv = function (k, v) {
    return UI.el('div', { class: 'kv' }, [
      UI.el('span', { class: 'k', text: k }),
      UI.el('span', { class: 'v', html: v })
    ]);
  };

  /* ステータス行（ホーム用） */
  UI.statRow = function (stat, value, settings, maxOverride) {
    var max = maxOverride || U.num(settings.display.statBarMax, 60);
    var pct = U.clamp((U.num(value, 0) / max) * 100, 0, 100);
    var sub = UI.statSubLabel(stat, settings);
    return UI.el('div', { class: 'stat-row stat-' + stat }, [
      UI.el('div', { class: 'stat-name' }, [
        UI.el('span', { text: UI.statLabel(stat, settings) }),
        sub ? UI.el('span', { class: 'ja', text: sub }) : null
      ]),
      UI.el('div', { class: 'stat-bar' }, [UI.el('i', { style: { width: pct + '%' } })]),
      UI.el('div', { class: 'stat-val', text: U.fmt(value, 1) })
    ]);
  };

  /* トグルスイッチ */
  UI.toggle = function (checked, onChange) {
    var input = UI.el('input', { type: 'checkbox', onchange: function () { onChange(input.checked); } });
    input.checked = !!checked;
    return UI.el('label', { class: 'toggle' }, [
      input, UI.el('span', { class: 'track' }), UI.el('span', { class: 'knob' })
    ]);
  };

  UI.switchRow = function (label, sub, control) {
    return UI.el('div', { class: 'switch-row' }, [
      UI.el('div', {}, [
        UI.el('div', { class: 'lb', text: label }),
        sub ? UI.el('div', { class: 'sub', text: sub }) : null
      ]),
      UI.el('div', { class: 'ctl' }, control)
    ]);
  };

  /* 数値設定行 */
  UI.numberSetting = function (label, sub, value, opts, onChange) {
    var input = UI.el('input', {
      type: 'number', value: value,
      step: opts.step || 'any', min: opts.min !== undefined ? opts.min : 0,
      inputmode: 'decimal',
      onchange: function () {
        var n = U.num(input.value, NaN);
        if (!isFinite(n) || (opts.min !== undefined && n < opts.min) || (opts.max !== undefined && n > opts.max)) {
          UI.toast('値が範囲外です', 'err');
          input.value = value;
          return;
        }
        onChange(n);
      }
    });
    return UI.switchRow(label, sub, input);
  };

  /* 簡易折れ線グラフ（SVG） */
  UI.lineChart = function (series, opts) {
    opts = opts || {};
    var W = 320, H = 160, padL = 38, padR = 10, padT = 12, padB = 22;
    var all = [];
    series.forEach(function (s) { s.points.forEach(function (p) { all.push(p.y); }); });
    if (!all.length) return UI.empty(opts.emptyText || 'データがありません');

    var minY = Math.min.apply(null, all), maxY = Math.max.apply(null, all);
    if (minY === maxY) { minY -= 1; maxY += 1; }
    var padY = (maxY - minY) * 0.12;
    minY -= padY; maxY += padY;

    var xs = [];
    series.forEach(function (s) { s.points.forEach(function (p) { xs.push(p.x); }); });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    if (minX === maxX) { minX -= 1; maxX += 1; }

    function px(x) { return padL + ((x - minX) / (maxX - minX)) * (W - padL - padR); }
    function py(y) { return padT + (1 - (y - minY) / (maxY - minY)) * (H - padT - padB); }

    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'chart');
    svg.setAttribute('preserveAspectRatio', 'none');

    /* グリッド */
    for (var i = 0; i <= 3; i++) {
      var yv = minY + (maxY - minY) * (i / 3);
      var ln = document.createElementNS(ns, 'line');
      ln.setAttribute('x1', padL); ln.setAttribute('x2', W - padR);
      ln.setAttribute('y1', py(yv)); ln.setAttribute('y2', py(yv));
      ln.setAttribute('stroke', '#2a3450'); ln.setAttribute('stroke-width', '1');
      svg.appendChild(ln);
      var tx = document.createElementNS(ns, 'text');
      tx.setAttribute('x', 4); tx.setAttribute('y', py(yv) + 3.5);
      tx.setAttribute('fill', '#6d7a95'); tx.setAttribute('font-size', '9');
      tx.textContent = U.fmt(yv, (maxY - minY) > 20 ? 0 : 1);
      svg.appendChild(tx);
    }

    series.forEach(function (s) {
      var pts = s.points.slice().sort(function (a, b) { return a.x - b.x; });
      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + px(p.x).toFixed(1) + ' ' + py(p.y).toFixed(1); }).join(' ');
      var path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', s.color || '#4dd9ff');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.appendChild(path);
      pts.forEach(function (p) {
        var c = document.createElementNS(ns, 'circle');
        c.setAttribute('cx', px(p.x)); c.setAttribute('cy', py(p.y)); c.setAttribute('r', '2.5');
        c.setAttribute('fill', s.color || '#4dd9ff');
        svg.appendChild(c);
      });
    });

    return svg;
  };

  /* ファイルダウンロード */
  UI.downloadText = function (filename, text, mime) {
    try {
      var blob = new Blob([text], { type: mime || 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = UI.el('a', { href: url, download: filename });
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 400);
      return true;
    } catch (e) {
      return false;
    }
  };

})(typeof window !== 'undefined' ? window : globalThis);
