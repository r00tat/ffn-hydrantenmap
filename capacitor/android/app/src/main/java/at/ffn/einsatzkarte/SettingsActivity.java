package at.ffn.einsatzkarte;

import android.content.SharedPreferences;
import android.os.Bundle;
import android.widget.Button;
import android.widget.EditText;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

public class SettingsActivity extends AppCompatActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_settings);

        SharedPreferences prefs = getSharedPreferences("einsatzkarte", MODE_PRIVATE);
        EditText input = findViewById(R.id.url_input);
        input.setText(prefs.getString("server_url_override", ""));

        Button save = findViewById(R.id.save);
        save.setOnClickListener(v -> {
            String value = input.getText().toString().trim();
            prefs.edit().putString("server_url_override", value).apply();
            Toast.makeText(this, "Gespeichert. App neu starten.", Toast.LENGTH_LONG).show();
            finish();
        });

        Button reset = findViewById(R.id.reset);
        reset.setOnClickListener(v -> {
            prefs.edit().remove("server_url_override").apply();
            input.setText("");
            Toast.makeText(this, "Zurückgesetzt. App neu starten.", Toast.LENGTH_LONG).show();
        });
    }
}
