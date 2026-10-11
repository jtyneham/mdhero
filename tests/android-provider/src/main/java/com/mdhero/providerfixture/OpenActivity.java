package com.mdhero.providerfixture;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.TextView;

public class OpenActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        TextView label = new TextView(this);
        label.setText("Separate file-manager provider fixture");
        setContentView(label);
        if (getIntent().getBooleanExtra("idle", false)) return;
        String kind = getIntent().getStringExtra("kind");
        if (kind == null) kind = "normal";
        Uri uri = Uri.parse("content://com.mdhero.providerfixture/items/" + kind);
        boolean share = getIntent().getBooleanExtra("share", false);
        Intent open = new Intent(share ? Intent.ACTION_SEND : Intent.ACTION_VIEW)
            .setClassName("com.mdhero.android.personal", "com.mdhero.android.personal.MainActivity")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        if (share) { open.setType("text/markdown"); open.putExtra(Intent.EXTRA_STREAM, uri); }
        else open.setDataAndType(uri, "text/markdown");
        open.setClipData(ClipData.newRawUri("External Markdown", uri));
        if (getIntent().getBooleanExtra("write", false)) open.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        startActivity(open);
    }
}
