/* =========================================================================
 * 俺だけレベルアップ / utils.js
 * 汎用ユーティリティ（日付・ID・数値・オブジェクト操作）
 * ========================================================================= */
(function (global) {
  'use strict';
  var ODL = global.ODL || (global.ODL = {});
  var U = ODL.Utils = {};

  /* ---------------- ID ---------------- */
  U.uuid = function () {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') {
        return global.crypto.randomUUID();
      }
      if (global.crypto && typeof global.crypto.getRandomValues === 'function') {
        var b = new Uint8Array(16);
        global.crypto.getRandomValues(b);
        b[6] = (b[6] & 0x0f) | 0x40;
        b[8] = (b[8] & 0x3f) | 0x80;
        var h = [];
        for (var i = 0; i < 16; i++) h.push((b[i] + 0x100).toString(16).slice(1));
        return h.slice(0, 4).join('') + '-' + h.slice(4, 6).join('') + '-' +
               h.slice(6, 8).join('') + '-' + h.slice(8, 10).join('') + '-' +
               h.slice(10, 16).join('');
      }
    } catch (e) { /* fallthrough */ }
    return 'id-' + Date.now().toString(36) + '-' +
           Math.random().toString(36).slice(2, 10) + '-' +
           Math.random().toString(36).slice(2, 10);
  };

  U.slugId = function (base) {
    var s = String(base || '').trim().toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
    if (!s) s = 'item';
    return s + '_' + Math.random().toString(36).slice(2, 7);
  };

  /* ---------------- 数値 ---------------- */
  U.num = function (v, fallback) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return (typeof n === 'number' && isFinite(n)) ? n : (fallback === undefined ? 0 : fallback);
  };

  U.round = function (v, digits) {
    var d = digits === undefined ? 0 : digits;
    var f = Math.pow(10, d);
    var n = U.num(v, 0);
    return Math.round(n * f) / f;
  };

  U.clamp = function (v, min, max) {
    var n = U.num(v, min);
    if (n < min) return min;
    if (n > max) return max;
    return n;
  };

  U.fmt = function (v, digits) {
    var d = digits === undefined ? 1 : digits;
    return U.num(v, 0).toFixed(d);
  };

  U.fmtInt = function (v) {
    return Math.round(U.num(v, 0)).toLocaleString('ja-JP');
  };

  /* ---------------- 日付（すべて YYYY-MM-DD のローカル日付文字列で扱う） ---------------- */
  U.pad2 = function (n) { return (n < 10 ? '0' : '') + n; };

  U.toDateStr = function (d) {
    var dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt.getTime())) return null;
    return dt.getFullYear() + '-' + U.pad2(dt.getMonth() + 1) + '-' + U.pad2(dt.getDate());
  };

  U.today = function () { return U.toDateStr(new Date()); };

  U.isDateStr = function (s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(U.parseDate(s));
  };

  U.parseDate = function (s) {
    if (s instanceof Date) return s.getTime();
    if (typeof s !== 'string') return NaN;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return NaN;
    var y = +m[1], mo = +m[2], da = +m[3];
    var d = new Date(y, mo - 1, da, 12, 0, 0, 0); /* 正午基準にしてDST影響を避ける */
    if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== da) return NaN;
    return d.getTime();
  };

  /* b - a の日数差 */
  U.diffDays = function (a, b) {
    var ta = U.parseDate(a), tb = U.parseDate(b);
    if (isNaN(ta) || isNaN(tb)) return NaN;
    return Math.round((tb - ta) / 86400000);
  };

  U.addDays = function (dateStr, days) {
    var t = U.parseDate(dateStr);
    if (isNaN(t)) return null;
    return U.toDateStr(new Date(t + days * 86400000));
  };

  U.monthKey = function (dateStr) {
    return typeof dateStr === 'string' ? dateStr.slice(0, 7) : '';
  };

  U.formatDateJa = function (dateStr, withWeekday) {
    var t = U.parseDate(dateStr);
    if (isNaN(t)) return String(dateStr || '');
    var d = new Date(t);
    var s = (d.getMonth() + 1) + '月' + d.getDate() + '日';
    if (withWeekday) s += '（' + '日月火水木金土'[d.getDay()] + '）';
    return s;
  };

  U.formatDateFull = function (dateStr) {
    var t = U.parseDate(dateStr);
    if (isNaN(t)) return String(dateStr || '');
    var d = new Date(t);
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日（' +
      '日月火水木金土'[d.getDay()] + '）';
  };

  U.nowIso = function () { return new Date().toISOString(); };

  /* ---------------- オブジェクト ---------------- */
  U.clone = function (o) {
    if (o === null || typeof o !== 'object') return o;
    try {
      if (typeof structuredClone === 'function') return structuredClone(o);
    } catch (e) { /* fallthrough */ }
    return JSON.parse(JSON.stringify(o));
  };

  U.isPlainObject = function (o) {
    return !!o && typeof o === 'object' && !Array.isArray(o);
  };

  /* defaults の構造を土台に、target の値で上書きしたものを返す（不足キーを補完） */
  U.mergeDefaults = function (target, defaults) {
    var out = U.clone(defaults);
    if (!U.isPlainObject(target)) return out;
    Object.keys(target).forEach(function (k) {
      var tv = target[k];
      if (U.isPlainObject(tv) && U.isPlainObject(out[k])) {
        out[k] = U.mergeDefaults(tv, out[k]);
      } else if (tv !== undefined) {
        out[k] = U.clone(tv);
      }
    });
    return out;
  };

  U.groupBy = function (arr, keyFn) {
    var map = {};
    (arr || []).forEach(function (item) {
      var k = keyFn(item);
      if (!map[k]) map[k] = [];
      map[k].push(item);
    });
    return map;
  };

  U.sum = function (arr, fn) {
    var t = 0;
    (arr || []).forEach(function (x, i) { t += U.num(fn ? fn(x, i) : x, 0); });
    return t;
  };

  U.escapeHtml = function (s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  /* 空のステータスオブジェクト */
  U.zeroStats = function () {
    var o = {};
    ODL.STATS.forEach(function (s) { o[s] = 0; });
    return o;
  };

})(typeof window !== 'undefined' ? window : globalThis);
