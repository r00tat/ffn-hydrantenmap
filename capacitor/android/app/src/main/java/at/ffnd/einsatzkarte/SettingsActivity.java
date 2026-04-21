package at.ffnd.einsatzkarte;

import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.View;
import android.widget.Button;
import android.widget.CompoundButton;
import android.widget.EditText;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.SwitchCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

public class SettingsActivity extends AppCompatActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_settings);

        // Ab targetSdk 35 ist edge-to-edge der Standard — die ActionBar überlagert
        // sonst das EditText. Root-Padding aus System-Bar-Insets + actionBarSize
        // berechnen.
        int actionBarHeight = 0;
        TypedValue tv = new TypedValue();
        if (getTheme().resolveAttribute(androidx.appcompat.R.attr.actionBarSize, tv, true)) {
            actionBarHeight = TypedValue.complexToDimensionPixelSize(
                tv.data, getResources().getDisplayMetrics()
            );
        }
        final int abHeight = actionBarHeight;

        View root = findViewById(R.id.settings_root);
        final int basePadding = root.getPaddingTop();
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime()
            );
            v.setPadding(
                bars.left + basePadding,
                bars.top + abHeight + basePadding,
                bars.right + basePadding,
                bars.bottom + basePadding
            );
            return WindowInsetsCompat.CONSUMED;
        });

        SharedPreferences prefs = getSharedPreferences("einsatzkarte", MODE_PRIVATE);
        EditText input = findViewById(R.id.url_input);
        input.setText(prefs.getString("server_url_override", ""));

        SwitchCompat allowInsecure = findViewById(R.id.allow_insecure_ssl);
        allowInsecure.setChecked(prefs.getBoolean("allow_insecure_ssl", false));
        allowInsecure.setOnCheckedChangeListener((CompoundButton v, boolean checked) ->
            prefs.edit().putBoolean("allow_insecure_ssl", checked).apply()
        );

        Button save = findViewById(R.id.save);
        save.setOnClickListener(v -> {
            String value = input.getText().toString().trim();
            prefs.edit().putString("server_url_override", value).apply();
            Toast.makeText(this, "Gespeichert. App neu starten.", Toast.LENGTH_LONG).show();
            finish();
        });

        Button reset = findViewById(R.id.reset);
        reset.setOnClickListener(v -> {
            prefs.edit()
                .remove("server_url_override")
                .remove("allow_insecure_ssl")
                .apply();
            input.setText("");
            allowInsecure.setChecked(false);
            Toast.makeText(this, "Zurückgesetzt. App neu starten.", Toast.LENGTH_LONG).show();
        });
    }
}
