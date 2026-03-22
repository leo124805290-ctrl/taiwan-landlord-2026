#!/bin/bash

# 推送前檢查腳本
# 用於替代 tsc 檢查，確保程式碼品質

echo "🚀 開始推送前檢查"
echo "===================="

# 檢查 @radix-ui 依賴
echo "🔍 檢查 @radix-ui 依賴..."
IMPORTS=$(grep -r --exclude-dir=node_modulesh --exclude-dir=node_modules "from '@radix-ui" --include="*.tsx" --include="*.ts" . --exclude-dir=node_modules | sed "s/.*from '//;s/'.*//" | sort -u)
if [ -n "$IMPORTS" ]; then
  echo "找到以下 @radix-ui 套件："
  echo "$IMPORTS"
  
  for pkg in $IMPORTS; do
    if ! grep -q "\"$pkg\"" package.json; then
      echo "❌ 缺少依賴: $pkg"
      echo "請在 package.json 的 dependencies 中加入：\"$pkg\": \"^版本號\""
      exit 1
    fi
  done
  echo "✅ 所有 @radix-ui 依賴都已安裝"
else
  echo "ℹ️ 未找到 @radix-ui 導入"
fi

# 檢查其他第三方套件（僅限 @開頭）
echo ""
echo "🔍 檢查其他第三方套件導入..."
ALL_IMPORTS=$(grep -r --exclude-dir=node_modulesh --exclude-dir=node_modules "from '" --include="*.tsx" --include="*.ts" . | grep "@" | sed "s/.*from '//;s/'.*//;s/'.*//" | sort -u | grep -v "^@radix-ui")
if [ -n "$ALL_IMPORTS" ]; then
  echo "找到以下第三方套件："
  echo "$ALL_IMPORTS"
  
  for pkg in $ALL_IMPORTS; do
    if ! grep -q "\"$pkg\"" package.json; then
      echo "⚠️  警告: 可能缺少依賴 $pkg"
      echo "   請確認是否已在 package.json 中"
    fi
  done
else
  echo "ℹ️ 未找到其他第三方套件導入"
fi

# 檢查未使用的解構變數（簡單檢查）
echo ""
echo "🔍 檢查未使用的解構變數..."
DECONSTRUCTED=$(grep -r --exclude-dir=node_modulesn "}: .*Props)" --include="*.tsx" .)
if [ -n "$DECONSTRUCTED" ]; then
  echo "找到以下解構參數："
  echo "$DECONSTRUCTED" | head -20
  echo ""
  echo "ℹ️ 請人工確認以上解構變數都有在函數中使用"
  echo "   如果未使用，可以加底線前綴（如 _propertyId）"
else
  echo "ℹ️ 未找到解構 Props"
fi

# 檢查常見問題標記
echo ""
echo "🔍 檢查 TODO/FIXME/HACK 標記..."
TODOS=$(grep -r --exclude-dir=node_modulesn "TODO\|FIXME\|HACK" --include="*.tsx" --include="*.ts" .)
if [ -n "$TODOS" ]; then
  echo "找到以下待處理標記："
  echo "$TODOS"
  echo ""
  echo "⚠️  警告: 程式碼中存在待處理標記"
  echo "   建議在推送前處理或至少確認可接受"
else
  echo "✅ 未找到 TODO/FIXME/HACK 標記"
fi

# 檢查常見的未使用變數名稱
echo ""
echo "🔍 檢查常見未使用變數名稱..."
UNUSED_PATTERNS="propertyId\|roomId\|tenantId\|userId\|_unused\|unused"
UNUSED_VARS=$(grep -r --exclude-dir=node_modulesn "$UNUSED_PATTERNS" --include="*.tsx" --include="*.ts" .)
if [ -n "$UNUSED_VARS" ]; then
  echo "找到以下可能未使用的變數："
  echo "$UNUSED_VARS" | head -30
  echo ""
  echo "ℹ️ 請確認這些變數是否確實需要，若未使用可考慮移除"
fi

# 檢查 console.log 除錯語句
echo ""
echo "🔍 檢查 console.log 除錯語句..."
CONSOLE_LOGS=$(grep -r --exclude-dir=node_modulesn "console\\.log\|console\\.warn\|console\\.error" --include="*.tsx" --include="*.ts" . | grep -v "//.*console")
if [ -n "$CONSOLE_LOGS" ]; then
  echo "找到以下 console 語句："
  echo "$CONSOLE_LOGS" | head -20
  echo ""
  echo "⚠️  警告: 生產環境應移除 console 語句"
  echo "   或確保僅用於開發除錯"
else
  echo "✅ 未找到 console 語句"
fi

echo ""
echo "===================="
echo "✅ 推送前檢查完成"
echo ""
echo "注意事項："
echo "1. 此檢查無法替代完整的 TypeScript 編譯檢查"
echo "2. 推送前仍需確認 Vercel/Zeabur 部署設定"
echo "3. 如有任何錯誤或警告，請先處理再推送"