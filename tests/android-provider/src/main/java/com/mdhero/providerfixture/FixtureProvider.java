package com.mdhero.providerfixture;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;

/** Installed separately from MDHero; models non-SAF file-manager providers. */
public class FixtureProvider extends ContentProvider {
    @Override public boolean onCreate() { return true; }
    @Override public String getType(Uri uri) { return "text/markdown"; }
    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String order) {
        String kind = uri.getLastPathSegment();
        if ("throws".equals(kind)) throw new IllegalArgumentException("Metadata is unsupported");
        ArrayList<String> columns = new ArrayList<>();
        // Like FileProvider: ignore unrecognized columns, including COLUMN_FLAGS.
        if (!"noname".equals(kind)) for (String column : projection == null ? new String[]{OpenableColumns.DISPLAY_NAME} : projection)
            if (OpenableColumns.DISPLAY_NAME.equals(column)) columns.add(column);
        MatrixCursor cursor = new MatrixCursor(columns.toArray(new String[0]));
        if (!"empty".equals(kind)) {
            Object[] values = new Object[columns.size()];
            for (int i = 0; i < values.length; i++) values[i] = "External " + kind + ".md";
            cursor.addRow(values);
        }
        return cursor;
    }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        String kind = uri.getLastPathSegment();
        if ("gone".equals(kind)) throw new FileNotFoundException("Source was removed");
        File file = new File(getContext().getFilesDir(), kind + ".md");
        if (!file.exists()) try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(("# External " + kind + "\n\nProvider stream is readable.\n").getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) { throw new FileNotFoundException(e.toString()); }
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.parseMode(mode));
    }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String where, String[] args) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String where, String[] args) { throw new UnsupportedOperationException(); }
}
