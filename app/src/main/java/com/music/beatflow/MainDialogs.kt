package com.music.beatflow

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import dev.chrisbanes.haze.HazeState
import kotlinx.coroutines.launch
import com.music.beatflow.auth.CapturedSession
import com.music.beatflow.auth.WebSessionMode
import com.music.beatflow.auth.YtMusicLoginScreen
import com.music.beatflow.auth.DiscordLoginScreen
import com.music.beatflow.auth.SpotifyLoginScreen
import com.music.beatflow.data.settings.AppSettings
import com.music.beatflow.data.scrobbling.LastFM
import com.music.beatflow.ui.components.ServerEditorHost
import com.music.beatflow.ui.components.FieldConfig
import com.music.beatflow.ui.components.LastfmLoginAlert

@Composable
internal fun GoogleSignInOverlay(
    mode: WebSessionMode,
    initialCookie: String?,
    onDismiss: () -> Unit,
    onCaptured: (CapturedSession) -> Unit,
) {
    BackHandler { onDismiss() }
    var captureRequest by remember(mode) { mutableIntStateOf(0) }
    var captureFailed by remember(mode) { mutableStateOf(false) }
    var pageReady by remember(mode) { mutableStateOf(false) }
    var confirmingProfile by remember(mode) { mutableStateOf(false) }
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize()) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onDismiss) {
                    Icon(
                        Icons.Rounded.Close,
                        contentDescription = stringResource(R.string.close),
                        tint = MaterialTheme.colorScheme.onBackground,
                    )
                }
                Column(Modifier.weight(1f)) {
                    Text(
                        text = when (mode) {
                            WebSessionMode.SIGN_IN -> stringResource(R.string.sign_in_youtube_music)
                            WebSessionMode.SWITCH_CHANNEL -> stringResource(R.string.choose_profile)
                        },
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                    if (pageReady) {
                        Text(
                            text = if (captureFailed) {
                                stringResource(R.string.profile_unavailable)
                            } else {
                                stringResource(R.string.switch_profile_hint)
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 2,
                        )
                    }
                }
                if (pageReady) {
                    TextButton(onClick = {
                        captureFailed = false
                        confirmingProfile = true
                        captureRequest++
                    }, enabled = !confirmingProfile) {
                        Text(
                            if (confirmingProfile) stringResource(R.string.checking)
                            else stringResource(R.string.use_this_profile),
                        )
                    }
                }
            }
            YtMusicLoginScreen(
                mode = mode,
                initialCookie = initialCookie,
                captureRequest = captureRequest,
                onPageReady = { pageReady = it },
                onCaptureUnavailable = {
                    confirmingProfile = false
                    captureFailed = true
                },
                onCaptured = { session ->
                    confirmingProfile = false
                    onCaptured(session)
                },
            )
        }
    }
}

@Composable
internal fun DiscordLoginOverlay(
    onDismiss: () -> Unit,
    onTokenCaptured: (String) -> Unit,
) {
    BackHandler { onDismiss() }
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize()) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onDismiss) {
                    Icon(
                        Icons.Rounded.Close,
                        contentDescription = stringResource(R.string.close),
                        tint = MaterialTheme.colorScheme.onBackground,
                    )
                }
                Text(
                    "Sign in to Discord",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onBackground,
                )
            }
            DiscordLoginScreen(onTokenCaptured = onTokenCaptured)
        }
    }
}

@Composable
internal fun SpotifyLoginOverlay(
    onDismiss: () -> Unit,
    onTokenCaptured: (String) -> Unit,
) {
    BackHandler { onDismiss() }
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize()) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onDismiss) {
                    Icon(
                        Icons.Rounded.Close,
                        contentDescription = stringResource(R.string.close),
                        tint = MaterialTheme.colorScheme.onBackground,
                    )
                }
                Text(
                    stringResource(R.string.spotify_sign_in),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onBackground,
                )
            }
            SpotifyLoginScreen(
                modifier = Modifier.navigationBarsPadding(),
                onConnected = onTokenCaptured,
            )
        }
    }
}

@Composable
internal fun WebDavEditorOverlay(
    hazeState: HazeState,
    onDismiss: () -> Unit,
) {
    BackHandler { onDismiss() }
    ServerEditorHost(
        hazeState = hazeState,
        title = stringResource(R.string.webdav),
        description = stringResource(R.string.webdav_description),
        fields = listOf(
            FieldConfig(
                initial = AppSettings.webdavUrl.value,
                placeholder = stringResource(R.string.webdav_server_url_hint),
                keyboardType = KeyboardType.Uri,
            ),
            FieldConfig(
                initial = AppSettings.webdavUsername.value,
                placeholder = stringResource(R.string.username),
            ),
            FieldConfig(
                initial = AppSettings.webdavPassword.value,
                placeholder = stringResource(R.string.password),
                keyboardType = KeyboardType.Password,
                isPassword = true,
            ),
        ),
        canSubmit = { it[0].isNotBlank() },
        testFailedRes = R.string.webdav_test_failed,
        onTest = { (url, username, password) ->
            com.music.beatflow.data.webdav.WebDavRepository.testConnection(
                url.trim(),
                username.trim(),
                password,
            )
        },
        onSave = { (url, username, password) ->
            AppSettings.setWebDavUrl(url.trim())
            AppSettings.setWebDavUsername(username.trim())
            AppSettings.setWebDavPassword(password)
            onDismiss()
        },
        onDismiss = onDismiss,
    )
}

@Composable
internal fun SmbEditorOverlay(
    hazeState: HazeState,
    onDismiss: () -> Unit,
) {
    BackHandler { onDismiss() }
    ServerEditorHost(
        hazeState = hazeState,
        title = stringResource(R.string.smb),
        description = stringResource(R.string.smb_description),
        fields = listOf(
            FieldConfig(
                initial = AppSettings.smbHost.value,
                placeholder = stringResource(R.string.smb_server_hint),
                keyboardType = KeyboardType.Uri,
            ),
            FieldConfig(
                initial = AppSettings.smbShare.value,
                placeholder = stringResource(R.string.smb_share_hint),
            ),
            FieldConfig(
                initial = AppSettings.smbBasePath.value,
                placeholder = stringResource(R.string.smb_folder_hint),
            ),
            FieldConfig(
                initial = AppSettings.smbUsername.value,
                placeholder = stringResource(R.string.username),
            ),
            FieldConfig(
                initial = AppSettings.smbPassword.value,
                placeholder = stringResource(R.string.password),
                keyboardType = KeyboardType.Password,
                isPassword = true,
            ),
        ),
        canSubmit = { it[0].isNotBlank() && it[1].isNotBlank() },
        testFailedRes = R.string.smb_test_failed,
        onTest = { (host, share, folder, username, password) ->
            com.music.beatflow.data.smb.SmbRepository.testConnection(
                host.trim(),
                share.trim(),
                folder.trim(),
                username.trim(),
                password,
            )
        },
        onSave = { (host, share, folder, username, password) ->
            AppSettings.setSmbHost(host.trim())
            AppSettings.setSmbShare(share.trim())
            AppSettings.setSmbBasePath(folder.trim())
            AppSettings.setSmbUsername(username.trim())
            AppSettings.setSmbPassword(password)
            onDismiss()
        },
        onDismiss = onDismiss,
    )
}

@Composable
internal fun LastfmLoginOverlay(
    hazeState: HazeState,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var usernameInput by remember { mutableStateOf("") }
    var passwordInput by remember { mutableStateOf("") }
    var lastfmError by remember { mutableStateOf<String?>(null) }
    var lastfmLoading by remember { mutableStateOf(false) }
    LastfmLoginAlert(
        hazeState = hazeState,
        usernameInput = usernameInput,
        onUsernameInputChange = { usernameInput = it },
        passwordInput = passwordInput,
        onPasswordInputChange = { passwordInput = it },
        error = lastfmError,
        loading = lastfmLoading,
        onSignIn = {
            lastfmLoading = true
            lastfmError = null
            scope.launch {
                try {
                    LastFM.initialize(
                        apiKey = AppSettings.lastfmApiKey.value,
                        secret = AppSettings.lastfmSecret.value,
                    )
                    LastFM.getMobileSession(usernameInput.trim(), passwordInput)
                        .onSuccess { auth ->
                            AppSettings.setLastfmSessionKey(auth.session.key)
                            AppSettings.setLastfmUsername(auth.session.name)
                            AppSettings.setLastfmEnabled(true)
                            onDismiss()
                        }
                        .onFailure { e ->
                            lastfmError = e.message ?: context.getString(R.string.login_failed)
                        }
                } catch (e: Exception) {
                    lastfmError = e.message ?: context.getString(R.string.login_failed)
                } finally {
                    lastfmLoading = false
                }
            }
        },
        onDismiss = { if (!lastfmLoading) onDismiss() },
    )
}
