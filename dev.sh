#!/usr/bin/env bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

APP_PACKAGE="com.keepr"
PORT=8081
DEV_URL="exp+keepr://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A${PORT}"

echo -e "${BLUE}=== Keepr Device Helper ===${NC}"

# Check for ADB device
if ! adb devices | grep -q "device$"; then
  echo -e "${RED}Error: No ADB device connected!${NC}"
  echo "Make sure USB debugging is enabled and your device is plugged in."
  exit 1
fi

DEVICE_ID=$(adb devices | grep "device$" | head -n 1 | awk '{print $1}')
echo -e "${GREEN}✓ Connected device: ${DEVICE_ID}${NC}"

case "$1" in
  reload|r)
    echo -e "${BLUE}Triggering hot reload...${NC}"
    adb reverse tcp:${PORT} tcp:${PORT} 2>/dev/null || true
    adb shell am broadcast -a com.facebook.react.devsupport.DevSupportManagerImpl.RELOAD_APP_ACTION > /dev/null 2>&1 || adb shell input text "rr"
    echo -e "${GREEN}✓ Reload signal sent.${NC}"
    ;;

  menu|m)
    echo -e "${BLUE}Opening React Native dev menu...${NC}"
    adb shell input keyevent 82
    echo -e "${GREEN}✓ Dev menu toggled.${NC}"
    ;;

  restart|open|"")
    echo -e "${BLUE}Configuring ADB reverse proxy (port ${PORT})...${NC}"
    adb reverse tcp:${PORT} tcp:${PORT}

    # Check if Metro is running
    if curl -s "http://localhost:${PORT}/status" | grep -q "running"; then
      echo -e "${GREEN}✓ Metro bundler is running on port ${PORT}.${NC}"
    else
      echo -e "${YELLOW}Warning: Metro bundler does not appear to be running on http://localhost:${PORT}.${NC}"
      echo -e "${YELLOW}Run 'npm start' in another terminal if it's not active.${NC}"
    fi

    echo -e "${BLUE}Launching Keepr directly on device...${NC}"
    adb shell am force-stop ${APP_PACKAGE} 2>/dev/null || true
    sleep 0.5
    adb shell am start -a android.intent.action.VIEW -d "${DEV_URL}" ${APP_PACKAGE} > /dev/null

    echo -e "${GREEN}✓ Keepr launched successfully!${NC}"
    echo -e "${BLUE}Tip: Run './dev.sh r' anytime to trigger a hot reload.${NC}"
    ;;

  mirror)
    echo -e "${BLUE}Starting scrcpy mirror...${NC}"
    scrcpy -w &
    ;;

  *)
    echo "Usage: ./dev.sh [command]"
    echo ""
    echo "Commands:"
    echo "  (no args)  Reverse port 8081 and launch Keepr directly into Metro"
    echo "  r, reload  Hot reload JS bundle without restarting the app process"
    echo "  m, menu    Open React Native dev menu (Key event 82)"
    echo "  mirror     Launch scrcpy screen mirroring"
    ;;
esac
