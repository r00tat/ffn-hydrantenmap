package at.ffn.einsatzkarte;

import android.content.SharedPreferences;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        SharedPreferences prefs = getSharedPreferences("einsatzkarte", MODE_PRIVATE);
        String override = prefs.getString("server_url_override", null);
        if (override != null && !override.trim().isEmpty()) {
            this.bridge.getWebView().loadUrl(override.trim());
        }
    }
}
