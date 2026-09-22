package app.roadto42.health

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import io.github.jan.supabase.auth.handleDeeplinks

class DeepLinkHandlerActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        RoadTo42Supabase.client.handleDeeplinks(intent) {
            startActivity(Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            })
            finish()
        }
    }
}
