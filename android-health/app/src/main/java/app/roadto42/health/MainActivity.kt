package app.roadto42.health

import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.lifecycle.lifecycleScope
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.Google
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private lateinit var health: HealthConnectClient
    private lateinit var status: TextView
    private lateinit var syncButton: Button

    private val permissions = setOf(
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class)
    )

    private val permissionLauncher = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { updateState() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val sdk = HealthConnectClient.getSdkStatus(this)
        if (sdk == HealthConnectClient.SDK_AVAILABLE) health = HealthConnectClient.getOrCreate(this)

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 80, 48, 48)
        }
        val title = TextView(this).apply { text = "Road to 42\nHealth Sync"; textSize = 30f }
        status = TextView(this).apply { textSize = 17f; setPadding(0, 30, 0, 20) }
        val login = Button(this).apply {
            text = "Sign in with Google"
            setOnClickListener { lifecycleScope.launch { RoadTo42Supabase.client.auth.signInWith(Google) } }
        }
        val permissionsButton = Button(this).apply {
            text = "Allow Health Connect"
            isEnabled = sdk == HealthConnectClient.SDK_AVAILABLE
            setOnClickListener { permissionLauncher.launch(permissions) }
        }
        syncButton = Button(this).apply {
            text = "Sync runs to Road to 42"
            isEnabled = false
            setOnClickListener { syncNow() }
        }
        layout.addView(title); layout.addView(status); layout.addView(login); layout.addView(permissionsButton); layout.addView(syncButton)
        setContentView(layout)
        updateState()
    }

    override fun onResume() { super.onResume(); updateState() }

    private fun updateState() {
        lifecycleScope.launch {
            val signedIn = RoadTo42Supabase.client.auth.currentUserOrNull() != null
            val healthAvailable = HealthConnectClient.getSdkStatus(this@MainActivity) == HealthConnectClient.SDK_AVAILABLE
            val granted = if (healthAvailable) health.permissionController.getGrantedPermissions().containsAll(permissions) else false
            status.text = when {
                !healthAvailable -> "Health Connect is unavailable or needs an update."
                !signedIn -> "1. Sign in with the same Google account you use for Road to 42."
                !granted -> "2. Allow Road to 42 to read your Health Connect training data."
                else -> "Connected. Your Road to 42 account and Health Connect are ready."
            }
            syncButton.isEnabled = signedIn && granted
        }
    }

    private fun syncNow() {
        lifecycleScope.launch {
            syncButton.isEnabled = false
            status.text = "Reading Health Connect…"
            try {
                val runs = HealthConnectRepository(health).recentRuns()
                status.text = "Syncing ${runs.size} runs…"
                val count = CloudSyncRepository().sync(runs)
                status.text = "Synced $count runs. Open Road to 42 to see your updated XP."
            } catch (e: Exception) {
                status.text = "Sync failed: ${e.message ?: "Unknown error"}"
            } finally {
                syncButton.isEnabled = true
            }
        }
    }
}
