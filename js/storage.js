/* =========================================================================
 * 俺だけレベルアップ / storage.js
 *
 * 「保存場所」だけを担当する最下層。
 * UIはもちろん、Repository より上のコードもここを直接触らない。
 * 将来 localStorage → IndexedDB に差し替える場合も、
 * このファイルの Driver を入れ替えるだけで済むようにしてある。
 * ========================================================================= */
(function (global) {
  'use strict';
  var ODL = global.ODL || (global.ODL = {});
  var U = ODL.Utils;

  /* ---------------------------------------------------------------------
   * Driver: localStorage 実装
   * ------------------------------------------------------------------- */
  function LocalStorageDriver(storage) {
    this.ls = storage;
    this.name = 'localStorage';
  }
  LocalStorageDriver.prototype.get = function (key) {
    var raw = this.ls.getItem(key);
    return raw === null ? null : raw;
  };
  LocalStorageDriver.prototype.set = function (key, value) {
    this.ls.setItem(key, value);
  };
  LocalStorageDriver.prototype.remove = function (key) {
    this.ls.removeItem(key);
  };
  LocalStorageDriver.prototype.keys = function () {
    var out = [];
    for (var i = 0; i < this.ls.length; i++) out.push(this.ls.key(i));
    return out;
  };

  /* ---------------------------------------------------------------------
   * Driver: メモリ実装（localStorage が使えない環境・テスト用）
   * ------------------------------------------------------------------- */
  function MemoryDriver() {
    this.map = {};
    this.name = 'memory';
  }
  MemoryDriver.prototype.get = function (k) {
    return Object.prototype.hasOwnProperty.call(this.map, k) ? this.map[k] : null;
  };
  MemoryDriver.prototype.set = function (k, v) { this.map[k] = String(v); };
  MemoryDriver.prototype.remove = function (k) { delete this.map[k]; };
  MemoryDriver.prototype.keys = function () { return Object.keys(this.map); };

  function detectDriver() {
    try {
      var ls = global.localStorage;
      if (ls) {
        var probe = '__odl_probe__';
        ls.setItem(probe, '1');
        ls.removeItem(probe);
        return new LocalStorageDriver(ls);
      }
    } catch (e) { /* Private mode など */ }
    return new MemoryDriver();
  }

  var driver = detectDriver();

  var Storage = ODL.Storage = {
    get driverName() { return driver.name; },
    isPersistent: function () { return driver.name !== 'memory'; },

    /* テスト用に差し替え可能にしておく */
    _useDriver: function (d) { driver = d; },
    _MemoryDriver: MemoryDriver,
    _LocalStorageDriver: LocalStorageDriver,

    readRaw: function (key) {
      try { return driver.get(key); } catch (e) { return null; }
    },

    writeRaw: function (key, str) {
      driver.set(key, str);
    },

    remove: function (key) {
      try { driver.remove(key); } catch (e) { /* noop */ }
    },

    keys: function () {
      try { return driver.keys(); } catch (e) { return []; }
    },

    /* JSONとして読む。壊れていても例外にせず、理由付きで返す */
    readJson: function (key) {
      var raw = Storage.readRaw(key);
      if (raw === null || raw === '') return { found: false, data: null, raw: null, error: null };
      try {
        return { found: true, data: JSON.parse(raw), raw: raw, error: null };
      } catch (e) {
        return { found: true, data: null, raw: raw, error: 'JSON_PARSE_ERROR' };
      }
    },

    /* 書き込み。書けなかった場合は既存データを壊さずに false を返す */
    writeJson: function (key, obj) {
      var str;
      try {
        str = JSON.stringify(obj);
      } catch (e) {
        return { ok: false, error: 'SERIALIZE_ERROR' };
      }
      try {
        driver.set(key, str);
        /* 書き込み検証（容量超過などで静かに失敗する環境への保険） */
        var back = driver.get(key);
        if (back === null || back.length !== str.length) {
          return { ok: false, error: 'VERIFY_FAILED' };
        }
        return { ok: true, bytes: str.length };
      } catch (e) {
        var name = e && e.name ? e.name : '';
        var quota = /quota/i.test(name) || /Quota/i.test(String(e && e.message));
        return { ok: false, error: quota ? 'QUOTA_EXCEEDED' : 'WRITE_ERROR' };
      }
    },

    estimateBytes: function () {
      var total = 0;
      Storage.keys().forEach(function (k) {
        if (k.indexOf('ore_dake_levelup') !== 0) return;
        var v = Storage.readRaw(k);
        total += (k.length + (v ? v.length : 0)) * 2;
      });
      return total;
    }
  };

})(typeof window !== 'undefined' ? window : globalThis);
