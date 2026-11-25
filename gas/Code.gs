/**
 * おうち家計簿 - Google Apps Script (Webアプリ)
 *
 * 【セットアップ手順】
 * 1. Google スプレッドシートを新規作成し、「拡張機能」→「Apps Script」を開く
 * 2. このファイルの中身をすべて貼り付けて保存
 * 3. 左メニューの「プロジェクトの設定（歯車）」→「スクリプト プロパティ」に以下を追加:
 *    - プロパティ名: GAS_SECRET
 *    - 値: アプリの設定画面と同じ任意のランダム文字列
 * 4. 右上「デプロイ」→「デプロイを管理」（または新しいデプロイ）→ 種類「ウェブアプリ」
 *    - 次のユーザーとして実行: 自分
 *    - アクセスできるユーザー: 全員（※GAS_SECRET で保護するため）
 * 5. 発行されたウェブアプリ URL をアプリの設定画面に登録
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
      return jsonResponse(
        buildSummary(sheet, payload.month, payload.scope || "すべて")
      );
    }

    if (payload.action === "append") {
      return jsonResponse(appendTransactions(sheet, payload.items || []));
    }

    if (payload.action === "update_transaction") {
      return jsonResponse(updateTransaction(sheet, payload));
    }

    if (payload.action === "delete_transaction") {
      return jsonResponse(deleteTransaction(sheet, payload.rowNumber));
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
    sheet
      .getRange(1, 1, 1, HEADERS.length)
      .setFontWeight("bold")
      .setBackground("#e2e8f0");
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet
      .getRange(1, 1, 1, HEADERS.length)
      .setFontWeight("bold")
      .setBackground("#e2e8f0");
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
    sheet
      .getRange(1, 1, 1, USER_HEADERS.length)
      .setFontWeight("bold")
      .setBackground("#e2e8f0");
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(USER_HEADERS);
    sheet
      .getRange(1, 1, 1, USER_HEADERS.length)
      .setFontWeight("bold")
      .setBackground("#e2e8f0");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getUsers() {
  const sheet = getOrCreateUsersSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const values = sheet
    .getRange(2, 1, lastRow - 1, USER_HEADERS.length)
    .getValues();
  const users = [];
  for (let i = 0; i < values.length; i++) {
    const email = String(values[i][0] || "")
      .trim()
      .toLowerCase();
    const name = String(values[i][1] || "").trim();
    const updatedAt = String(values[i][2] || "");
    if (email && name) {
      users.push({ email: email, name: name, updatedAt: updatedAt });
    }
  }
  return users;
}

function saveUser(email, name) {
  const cleanEmail = String(email || "")
    .trim()
    .toLowerCase();
  const cleanName = String(name || "").trim();
  if (!cleanEmail || !cleanName) {
    return { error: "メールアドレスと表示名は必須です。" };
  }

  const sheet = getOrCreateUsersSheet();
  const lastRow = sheet.getLastRow();
  const nowStr = Utilities.formatDate(
    new Date(),
    "Asia/Tokyo",
    "yyyy-MM-dd HH:mm:ss"
  );

  if (lastRow > 1) {
    const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < values.length; i++) {
      if (
        String(values[i][0] || "")
          .trim()
          .toLowerCase() === cleanEmail
      ) {
        sheet.getRange(i + 2, 2, 1, 2).setValues([[cleanName, nowStr]]);
        return { users: getUsers(), message: "ユーザー設定を更新しました。" };
      }
    }
  }

  sheet.appendRow([cleanEmail, cleanName, nowStr]);
  return { users: getUsers(), message: "ユーザーを登録しました。" };
}

function deleteUser(email) {
  const cleanEmail = String(email || "")
    .trim()
    .toLowerCase();
  const sheet = getOrCreateUsersSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = values.length - 1; i >= 0; i--) {
      if (
        String(values[i][0] || "")
          .trim()
          .toLowerCase() === cleanEmail
      ) {
        sheet.deleteRow(i + 2);
      }
    }
  }
  return { users: getUsers(), message: "ユーザーを削除しました。" };
}

function normalizeDateString(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, "Asia/Tokyo", "yyyy-MM-dd");
  }
  const s = String(val || "").trim().replace(/\//g, "-");
  // YYYY-M-D -> YYYY-MM-DD
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const mm = m[2].length === 1 ? "0" + m[2] : m[2];
    const dd = m[3].length === 1 ? "0" + m[3] : m[3];
    return m[1] + "-" + mm + "-" + dd;
  }
  return s;
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
    sheet
      .getRange(startRow, 1, rowsToAdd.length, HEADERS.length)
      .setValues(rowsToAdd);
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

function buildSummary(sheet, targetMonth, targetScope) {
  const lastRow = sheet.getLastRow();
  let totalIncome = 0;
  let totalExpense = 0;
  const byPayer = {};
  const categoryMap = {};
  const items = [];

  if (lastRow <= 1) {
    return {
      month: targetMonth,
      scope: targetScope,
      totalIncome: 0,
      totalExpense: 0,
      byPayer: {},
      categoryBreakdown: [],
      items: [],
    };
  }

  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const dateStr = normalizeDateString(row[0]);
    if (dateStr.indexOf(targetMonth) !== 0) {
      continue;
    }

    const type = String(row[1] || "支出");
    const category = String(row[2] || "その他");
    const title = String(row[3] || "");
    const amount = Number(row[4]) || 0;
    const paymentMethod = String(row[5] || "その他");
    const payer = String(row[6] || "その他");
    const scope = String(row[7] || "共通費");
    const source = String(row[8] || "");
    const memo = String(row[9] || "");
    const dedupeKey = String(row[10] || "");

    if (targetScope !== "すべて" && scope !== targetScope) {
      continue;
    }

    if (type === "収入") {
      totalIncome += amount;
    } else if (type === "支出") {
      totalExpense += amount;
      byPayer[payer] = (byPayer[payer] || 0) + amount;
      categoryMap[category] = (categoryMap[category] || 0) + amount;
    }

    items.push({
      rowNumber: i + 2,
      date: dateStr,
      type: type,
      category: category,
      title: title,
      amount: amount,
      paymentMethod: paymentMethod,
      payer: payer,
      scope: scope,
      source: source,
      memo: memo,
      dedupeKey: dedupeKey,
    });
  }

  // 支出日（日付）の新しい順（降順）、同日の場合は行番号の大きい順
  items.sort(function (a, b) {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    return b.rowNumber - a.rowNumber;
  });

  // カテゴリ別内訳（金額降順）
  const categoryBreakdown = Object.keys(categoryMap)
    .map(function (cat) {
      const amt = categoryMap[cat];
      const pct =
        totalExpense > 0 ? Math.round((amt / totalExpense) * 1000) / 10 : 0;
      return {
        category: cat,
        amount: amt,
        percentage: pct,
      };
    })
    .sort(function (a, b) {
      return b.amount - a.amount;
    });

  return {
    month: targetMonth,
    scope: targetScope,
    totalIncome: totalIncome,
    totalExpense: totalExpense,
    byPayer: byPayer,
    categoryBreakdown: categoryBreakdown,
    items: items,
  };
}

function updateTransaction(sheet, payload) {
  const rowNumber = Number(payload.rowNumber);
  const lastRow = sheet.getLastRow();
  if (!rowNumber || rowNumber < 2 || rowNumber > lastRow) {
    return { error: "対象の行が見つかりません（rowNumber=" + rowNumber + "）。" };
  }

  const amount = Math.max(0, Math.round(Number(payload.amount) || 0));
  const title = String(payload.title || "").trim();
  const dateStr = normalizeDateString(payload.date);

  sheet.getRange(rowNumber, 1).setValue(dateStr);
  sheet.getRange(rowNumber, 2).setValue(payload.type || "支出");
  sheet.getRange(rowNumber, 3).setValue(payload.category || "その他");
  sheet.getRange(rowNumber, 4).setValue(title);
  sheet.getRange(rowNumber, 5).setValue(amount).setNumberFormat("#,##0");
  sheet.getRange(rowNumber, 7).setValue(payload.payer || "共通");
  sheet.getRange(rowNumber, 8).setValue(payload.scope || "共通費");
  sheet.getRange(rowNumber, 10).setValue(payload.memo || "");
  if (payload.dedupeKey) {
    sheet.getRange(rowNumber, 11).setValue(payload.dedupeKey);
  }

  return { message: "明細を更新しました。" };
}

function deleteTransaction(sheet, rowNumber) {
  const targetRow = Number(rowNumber);
  const lastRow = sheet.getLastRow();
  if (!targetRow || targetRow < 2 || targetRow > lastRow) {
    return { error: "削除対象の行が見つかりません（rowNumber=" + targetRow + "）。" };
  }

  sheet.deleteRow(targetRow);
  return { message: "明細を削除しました。" };
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
