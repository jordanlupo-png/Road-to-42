package app.roadto42.health

import android.os.Bundle
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity

class PermissionsRationaleActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 80, 48, 48)
        }
        layout.addView(TextView(this).apply { text = "Road to 42 · Health data"; textSize = 28f })
        layout.addView(TextView(this).apply {
            textSize = 17f
            setPadding(0, 30, 0, 0)
            text = "Road to 42 reads only the Health Connect data you explicitly allow. Running sessions and distance are used to update your private training log and calculate your Road to 42 progress. Health data is stored under your signed-in account in Supabase. Road to 42 does not make heart rate, steps, or other private health measurements public on the competition leaderboard. You can revoke access at any time in Health Connect."
        })
        setContentView(layout)
    }
}
