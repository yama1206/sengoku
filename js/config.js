// 基本設定（数値はここで調整）
window.SGK = window.SGK || {};
SGK.VERSION = '0.17.0';
SGK.SAVE_SCHEMA = 7; // セーブデータの形式番号（形式を変えたら上げて、save.js の migrate に変換を書く）
SGK.CFG = {
  MIN_PER_SEC: 15,      // 現実1秒 = ゲーム内15分（1日 = 96秒）
  TICK_MS: 100,         // ホストの計算間隔
  NET_SEND_MS: 200,     // 参加者へ状態を送る間隔
  AUTOSAVE_SEC: 60,     // オートセーブ間隔
  BACKUP_EVERY: 5,      // オートセーブ何回ごとにバックアップを残すか
  BACKUPS: 3,           // バックアップの世代数
  MAX_PLAYERS: 4,
  PEER_PREFIX: 'sgk-r8-',
  WALK_KM_PER_DAY: 30,  // 徒歩の移動速度
  SIGHT_KM: 14,         // 地図で他の部隊が見える範囲（km）。山では狭く、城では広い
};
