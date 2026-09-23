/* =========================================================================
 * 俺だけレベルアップ / config.js
 * アプリ全体の定数・初期設定値・初期マスタ。
 * ここに書かれた数値は「設定値」であり、計算式やUIにハードコードしない。
 * ========================================================================= */
(function (global) {
  'use strict';
  var ODL = global.ODL || (global.ODL = {});

  ODL.APP_NAME = '俺だけレベルアップ';
  ODL.APP_VERSION = '0.1.1';

  /* 保存データのスキーマバージョン。構造を変えたら +1 して migration を足す */
  ODL.CURRENT_SCHEMA_VERSION = 1;
  /* 計算式のバージョン。記録に焼き込む（過去記録がどの式で計算されたか分かる） */
  ODL.CALC_VERSION = 1;

  ODL.STORAGE_KEY = 'ore_dake_levelup:data';
  ODL.AUTO_BACKUP_PREFIX = 'ore_dake_levelup:autobackup:';
  ODL.AUTO_BACKUP_KEEP = 5;
  ODL.BACKUP_FILE_PREFIX = 'ore_dake_levelup_backup_';

  ODL.STATS = ['STR', 'VIT', 'END', 'AGI', 'DEX'];

  ODL.STAT_LABELS = {
    STR: '筋力',
    VIT: '体力',
    END: '持久力',
    AGI: '敏捷性',
    DEX: '身体操作'
  };
  ODL.STAT_LABELS_LONG = {
    STR: '筋力',
    VIT: '体力',
    END: '持久力',
    AGI: '敏捷性',
    DEX: '身体操作・柔軟性'
  };
  ODL.STAT_COLORS = {
    STR: '#ff5d6c',
    VIT: '#ffb648',
    END: '#3fd1a0',
    AGI: '#4ea8ff',
    DEX: '#b07cff'
  };

  ODL.INPUT_TYPES = {
    reps:        { label: '回数のみ',        fields: ['reps'] },
    weight_reps: { label: '重量 × 回数',      fields: ['weight', 'reps'] },
    minutes:     { label: '時間（分）',       fields: ['minutes'] },
    distance_time: { label: '距離 + 時間',    fields: ['distance', 'durationMin'] }
  };

  ODL.CATEGORIES = {
    strength: '筋力',
    cardio: '有酸素',
    mobility: '柔軟・その他'
  };

  /* ---------------------------------------------------------------------
   * 初期設定値（設定画面から変更可能）
   * ------------------------------------------------------------------- */
  ODL.DEFAULT_SETTINGS = {
    exp: {
      /* 全体EXP倍率。バランス調整用 */
      expMultiplier: 1.0,
      /* Lv = floor(sqrt(累積EXP / levelCoefficient)) + 1 */
      levelCoefficient: 40
    },
    growth: {
      /* BaseGrowth = Load × growthCoefficient */
      growthCoefficient: 0.0025,
      /* GrowthCorrection = sqrt(statBase / currentStat) */
      statBase: 10,
      /* 成長が完全に止まらないよう補正に下限を設ける */
      minCorrection: 0.15,
      /* ステータス初期値 */
      initialStat: 10
    },
    pace: {
      /* ランニングの基準ペース（分/km） */
      basePaceMinPerKm: 6,
      minPaceFactor: 0.6,
      maxPaceFactor: 1.6
    },
    streak: {
      /* 「記録なしがこの日数続いたらリセット」 */
      resetAfterDays: 3,
      /* 到達ストリーク日数 → EXPボーナス率 */
      bonusTable: [
        { days: 3,   rate: 0.05 },
        { days: 7,   rate: 0.10 },
        { days: 14,  rate: 0.15 },
        { days: 30,  rate: 0.20 },
        { days: 60,  rate: 0.25 },
        { days: 100, rate: 0.30 }
      ]
    },
    pb: {
      enabled: true,
      /* パーソナルベスト更新時のEXPボーナス率 */
      bonus: 0.10
    },
    display: {
      /* ja: 日本語 / abbr: 略称 / both: 両方 */
      statLabel: 'both',
      theme: 'dark',
      /* ステータスバーの満タン基準値 */
      statBarMax: 60
    }
  };

  /* ---------------------------------------------------------------------
   * 初期種目マスタ（ハードコードではなく「初期データ」）
   * 係数の根拠:
   *   週3回 × 複数種目 を1年継続 → Lv20台 に着地するよう調整。
   *   例) 腕立て100回=Load40 / スクワット100回=Load36 / 腹筋100回=Load32
   *       懸垂25回=Load40 / ランニング5km(6分/km)=Load50
   * ------------------------------------------------------------------- */
  ODL.DEFAULT_ACTIVITY_MASTERS = [
    {
      activityId: 'running', name: 'ランニング', shortName: 'ラン', icon: '🏃',
      category: 'cardio', inputType: 'distance_time', unit: 'km',
      loadCoefficient: 10.0, expCoefficient: 1.0,
      statAllocation: { STR: 0, VIT: 20, END: 60, AGI: 20, DEX: 0 },
      quickValues: [2, 3, 5, 10],
      active: true, sortOrder: 10, builtIn: true
    },
    {
      activityId: 'squat', name: 'スクワット', shortName: 'スクワット', icon: '🦵',
      category: 'strength', inputType: 'reps', unit: '回',
      loadCoefficient: 3.6, expCoefficient: 1.0,
      statAllocation: { STR: 60, VIT: 30, END: 10, AGI: 0, DEX: 0 },
      quickValues: [20, 50, 100, 150],
      active: true, sortOrder: 20, builtIn: true
    },
    {
      activityId: 'pushup', name: '腕立て伏せ', shortName: '腕立て', icon: '💪',
      category: 'strength', inputType: 'reps', unit: '回',
      loadCoefficient: 4.0, expCoefficient: 1.0,
      statAllocation: { STR: 70, VIT: 30, END: 0, AGI: 0, DEX: 0 },
      quickValues: [20, 50, 100, 150],
      active: true, sortOrder: 30, builtIn: true
    },
    {
      activityId: 'pullup', name: '懸垂', shortName: '懸垂', icon: '🧗',
      category: 'strength', inputType: 'reps', unit: '回',
      loadCoefficient: 8.0, expCoefficient: 1.0,
      statAllocation: { STR: 65, VIT: 15, END: 0, AGI: 0, DEX: 20 },
      quickValues: [5, 10, 20, 30],
      active: true, sortOrder: 40, builtIn: true
    },
    {
      activityId: 'situp', name: '腹筋', shortName: '腹筋', icon: '🔥',
      category: 'strength', inputType: 'reps', unit: '回',
      loadCoefficient: 3.2, expCoefficient: 1.0,
      statAllocation: { STR: 30, VIT: 50, END: 20, AGI: 0, DEX: 0 },
      quickValues: [20, 50, 100, 150],
      active: true, sortOrder: 50, builtIn: true
    },
    {
      activityId: 'grip', name: '握力', shortName: '握力', icon: '✊',
      category: 'strength', inputType: 'weight_reps', unit: 'kg・回',
      loadCoefficient: 0.6, expCoefficient: 1.0,
      statAllocation: { STR: 90, VIT: 10, END: 0, AGI: 0, DEX: 0 },
      quickValues: [],
      active: true, sortOrder: 60, builtIn: true
    },
    {
      activityId: 'stretch', name: '柔軟', shortName: '柔軟', icon: '🧘',
      category: 'mobility', inputType: 'minutes', unit: '分',
      loadCoefficient: 4.5, expCoefficient: 1.0,
      statAllocation: { STR: 0, VIT: 0, END: 0, AGI: 20, DEX: 80 },
      quickValues: [5, 10, 15, 30],
      active: true, sortOrder: 70, builtIn: true
    }
  ];

  /* 身体データの測定項目（ゲームのステータスとは完全に別物） */
  ODL.DEFAULT_BODY_METRICS = [
    { metricId: 'height',   name: '身長',   unit: 'cm', step: 0.1, active: true,  sortOrder: 10, builtIn: true },
    { metricId: 'weight',   name: '体重',   unit: 'kg', step: 0.1, active: true,  sortOrder: 20, builtIn: true },
    { metricId: 'bodyFat',  name: '体脂肪率', unit: '%', step: 0.1, active: true,  sortOrder: 30, builtIn: true },
    { metricId: 'chest',    name: '胸囲',   unit: 'cm', step: 0.1, active: true,  sortOrder: 40, builtIn: true },
    { metricId: 'waist',    name: 'ウエスト', unit: 'cm', step: 0.1, active: true,  sortOrder: 50, builtIn: true },
    { metricId: 'arm',      name: '上腕',   unit: 'cm', step: 0.1, active: true,  sortOrder: 60, builtIn: true },
    { metricId: 'thigh',    name: '太もも', unit: 'cm', step: 0.1, active: true,  sortOrder: 70, builtIn: true }
  ];

})(typeof window !== 'undefined' ? window : globalThis);
