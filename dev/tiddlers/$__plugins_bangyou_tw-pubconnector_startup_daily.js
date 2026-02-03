/*\
title: $:/plugins/bangyou/tw-pubconnector/startup/daily.js
type: application/javascript
module-type: startup
\*/

"use strict";

exports.name = "cron-authoring-auto-update";
exports.platforms = ["node"];
exports.after = ["startup"];
exports.synchronous = true;

exports.startup = function () {
    const firstArg = $tw.boot?.argv?.[0];
    if (firstArg !== "--listen") {
        // Running a CLI command: do NOT start cron timers
        return;
    }
    const ENABLE_TIDDLER = "$:/config/tw-pubconnector/authoring/auto-update/enable";
    const HOUR_TIDDLER = "$:/config/tw-pubconnector/authoring/auto-update/hour";
    const MINUTE_TIDDLER = "$:/config/tw-pubconnector/authoring/auto-update/minute";

    let lastRun = "";

    function isValidHour(hour) {
        return hour === -1 || (Number.isInteger(hour) && hour >= 0 && hour <= 23);
    }

    function isValidMinute(minute) {
        return minute === -1 || (Number.isInteger(minute) && minute >= 0 && minute <= 59);
    }

    function getField(title, defaultValue = "-1") {
        const tiddler = $tw.wiki.getTiddler(title);
        return tiddler ? tiddler.fields.text : defaultValue;
    }

    function shouldRunNow(now, hourStr, minuteStr) {
        const hour = parseInt(hourStr);
        const minute = parseInt(minuteStr);
        const nowHour = now.getHours();
        const nowMinute = now.getMinutes();
        const key = `${now.toDateString()} ${nowHour}:${nowMinute}`;
    
        if (!isValidHour(hour) || !isValidMinute(minute)) {
            console.warn(`⚠️ Invalid schedule time: hour=${hourStr}, minute=${minuteStr}`);
            return false;
        }

        // Prevent repeated execution
        if (lastRun === key) return false;

        const matchHour = (hour === -1 || nowHour === hour);
        const matchMinute = (minute === -1 || nowMinute === minute);
        
        if (matchHour && matchMinute) {
            lastRun = key;
            return true;
        }
        return false;
    }
    console.log("⏰ Auto update scheduled to run daily at", getField(HOUR_TIDDLER, "-1"), ":", getField(MINUTE_TIDDLER, "-1"));
    setInterval(() => {
        const enabled = getField(ENABLE_TIDDLER, "disable");
        if (enabled !== "enable") return;

        const now = new Date();
        const hour = getField(HOUR_TIDDLER, "-1");
        const minute = getField(MINUTE_TIDDLER, "-1");

        if (shouldRunNow(now, hour, minute)) {
            console.log("⏰ Auto update triggered at", now.toLocaleString());
            var authoring = require("$:/plugins/bangyou/tw-pubconnector/api/authoring.js").Authoring();
            if (authoring.isUpdating()) {
				return;
			}
            authoring.startUpdate();
            console.log("✅ Auto update caches started successfully.");
            return;
        }

    }, 60 * 1000); // Check every minute
};

