/**
 * おうち家計簿 - Google Apps Script (Webアプリ)
 *
 * 【セットアップ手順】
 * 1. Google スプレッドシートを新規作成し、「拡張機能」→「Apps Script」を開く
 * 2. このファイルの中身をすべて貼り付けて保存
 * 3. 左メニューの「プロジェクトの設定（歯車）」→「スクリプト プロパティ」に以下を追加:
 *    - プロパティ名: GAS_SECRET
 *    - 値: Cloudflare Workers の GAS_SECRET と同じ任意のランダム文字列
 * 4. 右上「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *    - 次のユーザーとして実行: 自分
 *    - アクセスできるユーザー: 全員（※GAS_SECRET で保護するため）
 * 5. 発行されたウェブアプリ URL を Cloudflare Workers の GAS_WEBHOOK_URL に設定
 */

const SHEET_NAME = "明細";
const USERS_SHEET_NAME = "ユーザー";

const HEADERS = [
  "日付",
  "収支",
  "カテゴリ",
  "内容・店名",
  "金額",
  "支払方法",
  "支払・受取者",
  "区分",
  "入力元",
  "メモ",
  "重複チェックキー",
  "登録日時",
];

const USER_HEADERS = ["メールアドレス", "表示名", "更新日時"];

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const expectedSecret =
      PropertiesService.getScriptProperties().getProperty("GAS_SECRET");

    if (expectedSecret && payload.secret !== expectedSecret) {
      return jsonResponse({ error: "認証エラー: GAS_SECRET が一致しません。" });
    }

    if (payload.action === "get_users") {
      return jsonResponse({ users: getUsers() });
    }

    if (payload.action === "save_user") {
      return jsonResponse(saveUser(payload.email, payload.name));
    }

    if (payload.action === "delete_user") {
      return jsonResponse(deleteUser(payload.email));
    }

    const sheet = getOrCreateSheet();

    if (payload.action === "summary") {
      return jsonResponse(buildSummary(sheet, payload.month));
    }

    if (payload.action === "append") {
      return jsonResponse(appendTransactions(sheet, payload.items || []));
    }

    return jsonResponse({ error: "不明なアクションです。" });
  } catch (err) {
    return jsonResponse({ error: err.message || String(err) });
  }
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold").setBackground("#e2e8f0");
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold").setBackground("#e2e8f0");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getOrCreateUsersSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(USERS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(USERS_SHEET_NAME);
    sheet.appendRow(USER_HEADERS);
    sheet.getRange(1, 1, 1, USER_HEADERS.length).setFontWeight("bold").setBackground("#e2e8f0");
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(USER_HEADERS);
    sheet.getRange(1, 1, 1, USER_HEADERS.length).setFontWeight("bold").setBackground("#e2e8f0");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getUsers() {
  const sheet = getOrCreateUsersSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, USER_HEADERS.length).getValues();
  const users = [];
  for (let i = 0; i < values.length; i++) {
    const email = String(values[i][0] || "").trim().toLowerCase();
    const name = String(values[i][1] || "").trim();
    const updatedAt = String(values[i][2] || "");
    if (email && name) {
      users.push({ email: email, name: name, updatedAt: updatedAt });
    }
  }
  return users;
}

function saveUser(email, name) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanName = String(name || "").trim();
  if (!cleanEmail || !cleanName) {
    return { error: "メールアドレスと表示名は必須です。" };
  }

  const sheet = getOrCreateUsersSheet();
  const lastRow = sheet.getLastRow();
  const nowStr = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");

  if (lastRow > 1) {
    const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0] || "").trim().toLowerCase() === cleanEmail) {
        sheet.getRange(i + 2, 2, 1, 2).setValues([[cleanName, nowStr]]);
        return { users: getUsers(), message: "ユーザー設定を更新しました。" };
      }
    }
  }

  sheet.appendRow([cleanEmail, cleanName, nowStr]);
  return { users: getUsers(), message: "ユーザーを登録しました。" };
}

function deleteUser(email) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const sheet = getOrCreateUsersSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = values.length - 1; i >= 0; i--) {
      if (String(values[i][0] || "").trim().toLowerCase() === cleanEmail) {
        sheet.deleteRow(i + 2);
      }
    }
  }
  return { users: getUsers(), message: "ユーザーを削除しました。" };
}

function appendTransactions(sheet, items) {
  const lastRow = sheet.getLastRow();
  const existingKeys = new Set();

  if (lastRow > 1) {
    const keyValues = sheet.getRange(2, 11, lastRow - 1, 1).getValues();
    for (let i = 0; i < keyValues.length; i++) {
      const k = String(keyValues[i][0] || "").trim();
      if (k) existingKeys.add(k);
    }
  }

  const rowsToAdd = [];
  const skippedKeys = [];
  const nowStr = Utilities.formatDate(
    new Date(),
    "Asia/Tokyo",
    "yyyy-MM-dd HH:mm:ss"
  );

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const key = String(item.dedupeKey || "").trim();
    if (key && existingKeys.has(key)) {
      skippedKeys.push(key);
      continue;
    }
    if (key) existingKeys.add(key);

    rowsToAdd.push([
      item.date,
      item.type,
      item.category,
      item.title,
      Number(item.amount) || 0,
      item.paymentMethod,
      item.payer,
      item.scope,
      item.source,
      item.memo || "",
      key,
      nowStr,
    ]);
  }

  if (rowsToAdd.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rowsToAdd.length, HEADERS.length).setValues(rowsToAdd);
    sheet.getRange(startRow, 5, rowsToAdd.length, 1).setNumberFormat("#,##0");
  }

  const savedCount = rowsToAdd.length;
  const skippedCount = skippedKeys.length;
  let message = savedCount + "件をスプレッドシートに記録しました！";
  if (skippedCount > 0) {
    message += "（重複 " + skippedCount + "件はスキップしました）";
  }

  return {
    savedCount: savedCount,
    skippedCount: skippedCount,
    skippedKeys: skippedKeys,
    message: message,
  };
}

function buildSummary(sheet, targetMonth) {
  const lastRow = sheet.getLastRow();
  let totalIncome = 0;
  let totalExpense = 0;
  const byPayer = {};
  const recentItems = [];

  if (lastRow <= 1) {
    return {
      month: targetMonth,
      totalIncome: 0,
      totalExpense: 0,
      byPayer: {},
      recentItems: [],
    };
  }

  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();

  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    let dateStr = "";
    if (row[0] instanceof Date) {
      dateStr = Utilities.formatDate(row[0], "Asia/Tokyo", "yyyy-MM-dd");
    } else {
      dateStr = String(row[0] || "");
    }

    const type = String(row[1] || "");
    const category = String(row[2] || "");
    const title = String(row[3] || "");
    const amount = Number(row[4]) || 0;
    const payer = String(row[6] || "その他");

    if (dateStr.indexOf(targetMonth) === 0) {
      if (type === "収入") {
        totalIncome += amount;
      } else if (type === "支出") {
        totalExpense += amount;
        byPayer[payer] = (byPayer[payer] || 0) + amount;
      }
    }

    if (recentItems.length < 15) {
      recentItems.push({
        date: dateStr,
        type: type,
        category: category,
        title: title,
        amount: amount,
        payer: payer,
      });
    }
  }

  return {
    month: targetMonth,
    totalIncome: totalIncome,
    totalExpense: totalExpense,
    byPayer: byPayer,
    recentItems: recentItems,
  };
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
