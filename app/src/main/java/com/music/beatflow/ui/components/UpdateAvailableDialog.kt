package com.music.beatflow.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.halilibo.richtext.markdown.Markdown
import com.halilibo.richtext.ui.RichTextStyle
import com.halilibo.richtext.ui.material3.RichText
import com.music.beatflow.BuildConfig
import com.music.beatflow.R
import com.music.beatflow.data.AppUpdateChecker
import com.music.beatflow.data.settings.AppSettings
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.materials.ExperimentalHazeMaterialsApi
import dev.chrisbanes.haze.materials.HazeMaterials

/** UIAlertController's own metrics: fixed narrow width, 14pt corner, 44pt rows. */
internal val ALERT_WIDTH = 270.dp
internal val ALERT_CORNER = 14.dp
internal val ACTION_HEIGHT = 44.dp

/**
 * The dim behind the alert. Flat on purpose — the glass is the card, and
 * blurring the wallpaper *behind* it too leaves nothing for the card to be
 * frosted against, which is what made this read as a grey box before.
 */
internal val SCRIM_COLOR = Color.Black.copy(alpha = 0.28f)

private val DOWNLOAD_ROW_HEIGHT = 4.dp

/** How much of the card's height the release notes are allowed to fill before scrolling. */
private val NOTES_MAX_HEIGHT = 220.dp

/** The banner art's own shape — it's drawn 2048×768 — so the header never guesses its height. */
private val BANNER_ASPECT = 2048f / 768f

/**
 * Which read the running→released bump carries: staying on x.y and stepping
 * only the patch is a hotfix — v1.9.0 to v1.9.1 — while stepping any other dot
 * is an Update — v1.8.0 to v1.9.0. The release workflow does the same
 * arithmetic for the release page's own title, so the card and the page agree.
 *
 * The running build may carry a prerelease tail (`1.9.1-beta2` on dev builds);
 * everything past its first hyphen is outside the arithmetic and is dropped.
 */
private fun isHotfix(current: String, target: String): Boolean {
    fun parts(version: String): List<Int> =
        version.substringBefore('-').removePrefix("v").split('.')
            .mapNotNull { it.trim().toIntOrNull() }
    val before = parts(current)
    val after = parts(target)
    return before.size >= 2 && after.size >= 2 &&
        before[0] == after[0] && before[1] == after[1]
}

/**
 * What the card's changelog section shows of the release body. The card draws
 * the banner, the kind and the from→to line itself, so a structured body — the
 * kind the release workflow now writes — is cut at its `### Changelog` heading
 * and everything under it, the bullet list, is taken whole. Bodies from before
 * the structured format carry no heading to cut at; their headings and the
 * lines the card now draws itself are filtered out instead, leaving the
 * readable text underneath.
 */
private fun changelogOf(notes: String?): String? {
    val body = notes ?: return null
    val headingAt = body.indexOf("### Changelog")
    if (headingAt >= 0) {
        return body.substring(headingAt + "### Changelog".length).trim()
            .takeIf { it.isNotBlank() }
    }
    val readable = body.lines().filter { line ->
        val trimmed = line.trim()
        !(trimmed.startsWith("<") || trimmed.startsWith("#") ||
            trimmed.startsWith("**Updated from") || trimmed.startsWith("Updated from"))
    }
    return readable.joinToString("\n").trim().takeIf { it.isNotBlank() }
}

/**
 * Once-per-launch nudge that a newer build is on GitHub Releases — the top
 * bar's [Icons.Rounded.Upgrade][androidx.compose.material.icons.rounded.Upgrade]
 * icon is the quiet, always-there version of this; this is the one-time,
 * hard-to-miss version shown the moment the check comes back.
 *
 * Shaped like an iOS system alert, which is the same lineage as the rest of the
 * app's Apple Music styling: frosted card, hairline rules, full-width actions
 * stacked under the message rather than a Material button pair in the corner.
 *
 * The update round trip happens here rather than in a browser: Download pulls
 * the release's APK into the app cache (progress fills the hairline under the
 * message), then Install hands it to the system installer. Where the release
 * carries no APK at all, the actions fall back to opening the releases page.
 *
 * Sits over the whole app as an overlay rather than an Android [Dialog][androidx.compose.ui.window.Dialog]
 * so its glass can sample the same [HazeState] the rest of the app's frosted
 * surfaces use, the way [FrostedTopBar] and [MiniPlayer] already do.
 */
@OptIn(ExperimentalHazeMaterialsApi::class)
@Composable
fun UpdateAvailableDialog(
    version: String,
    notes: String?,
    hazeState: HazeState,
    onDismiss: () -> Unit,
    onDownload: () -> Unit,
    onCancelDownload: () -> Unit,
    onInstall: () -> Unit,
    onOpenReleasePage: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val reduceDynamicBlur by AppSettings.reduceDynamicBlur.collectAsStateWithLifecycle()
    val state by AppUpdateChecker.download.collectAsStateWithLifecycle()
    val shape = RoundedCornerShape(ALERT_CORNER)
    // The bump decides the read, the same arithmetic the release workflow does
    // for the release page's own title: keeping x.y and stepping the patch is
    // a hotfix — v1.9.0 to v1.9.1 — and stepping any other dot is an Update.
    val kind = stringResource(
        if (isHotfix(BuildConfig.VERSION_NAME, version)) {
            R.string.update_kind_hotfix
        } else {
            R.string.update_kind_update
        },
    )

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(SCRIM_COLOR)
            // Tapping the scrim reads the same as Remind Me Later — nothing
            // about this update is mandatory, so backing out of it should be as
            // easy as getting into it. Mid-download it only closes the sheet;
            // the download keeps going and the top-bar icon reopens this.
            .clickable(
                indication = null,
                interactionSource = remember { MutableInteractionSource() },
                onClick = onDismiss,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .width(ALERT_WIDTH)
                .clip(shape)
                .then(
                    if (reduceDynamicBlur) {
                        Modifier.background(MaterialTheme.colorScheme.surface)
                    } else {
                        Modifier.optimizedHazeEffect(
                            state = hazeState,
                            style = HazeMaterials.regular(MaterialTheme.colorScheme.surface),
                        )
                    },
                )
                // Swallows the tap before it reaches the scrim behind, so
                // touching the card itself never dismisses it.
                .clickable(
                    indication = null,
                    interactionSource = remember { MutableInteractionSource() },
                    onClick = {},
                ),
        ) {
            // The banner opens the card, drawn at its own shape: it fills the
            // width and the height follows from the art's ratio. Inset by
            // nothing — a full-bleed header is what makes it read as art
            // opening the card, and the card's clip answers for its top
            // corners.
            Image(
                painter = painterResource(R.drawable.beatflow_banner),
                contentDescription = null,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(BANNER_ASPECT),
                contentScale = ContentScale.FillBounds,
            )
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 19.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = kind,
                    style = MaterialTheme.typography.bodyLarge.copy(
                        fontSize = 17.sp,
                        fontWeight = FontWeight.W600,
                    ),
                    color = MaterialTheme.colorScheme.onSurface,
                    textAlign = TextAlign.Center,
                )
                // Whence and whither — the body's own "**Updated from …**"
                // line, drawn by the card: where this build is coming from and
                // the release it's being offered. The running version's
                // prerelease tail, which dev builds carry, is left out of the
                // wording — the release itself carries no tail.
                Text(
                    text = stringResource(
                        R.string.update_from_to,
                        BuildConfig.VERSION_NAME.substringBefore('-'),
                        version,
                    ),
                    modifier = Modifier.padding(top = 4.dp),
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontSize = 13.sp,
                        lineHeight = 17.sp,
                    ),
                    color = MaterialTheme.colorScheme.onSurface,
                    textAlign = TextAlign.Center,
                )

                // The download's progress, drawn as a thin fill across a
                // hairline track — same weight as [AlertRule], so it reads as
                // part of the card rather than a widget bolted onto it.
                val downloading = state as? AppUpdateChecker.DownloadState.Downloading
                if (downloading != null || state is AppUpdateChecker.DownloadState.Failed) {
                    Box(
                        Modifier
                            .padding(top = 12.dp)
                            .fillMaxWidth()
                            .height(DOWNLOAD_ROW_HEIGHT)
                            .clip(RoundedCornerShape(DOWNLOAD_ROW_HEIGHT / 2))
                            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.14f)),
                    ) {
                        if (downloading != null && downloading.fraction > 0f) {
                            Box(
                                Modifier
                                    .fillMaxWidth(downloading.fraction)
                                    .height(DOWNLOAD_ROW_HEIGHT)
                                    .clip(RoundedCornerShape(DOWNLOAD_ROW_HEIGHT / 2))
                                    .background(MaterialTheme.colorScheme.primary),
                            )
                        }
                    }
                }
                if (state is AppUpdateChecker.DownloadState.Failed) {
                    Text(
                        text = (state as AppUpdateChecker.DownloadState.Failed).message,
                        modifier = Modifier.padding(top = 6.dp),
                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
                        color = MaterialTheme.colorScheme.error,
                        textAlign = TextAlign.Center,
                    )
                }

                // The release's own notes, rendered as Markdown rather than
                // dumped as raw text — GitHub release bodies lean on headings,
                // bullet lists and bold, and those are the whole point of
                // reading this before installing. What the card draws itself
                // is already above; what [changelogOf] hands back is purely
                // the words that changed.
                val changelog = changelogOf(notes)
                if (changelog != null) {
                    AlertRule(modifier = Modifier.padding(top = 12.dp))
                    Text(
                        text = stringResource(R.string.changelog_title),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 12.dp),
                        style = MaterialTheme.typography.bodyMedium.copy(
                            fontSize = 12.sp,
                            fontWeight = FontWeight.W600,
                        ),
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        textAlign = TextAlign.Start,
                    )
                    Box(
                        modifier = Modifier
                            .padding(top = 4.dp)
                            .heightIn(max = NOTES_MAX_HEIGHT)
                            .verticalScroll(rememberScrollState()),
                    ) {
                        // RichText's Material3 Text leans on LocalContentColor,
                        // which nothing here provides — this card is a plain
                        // Column.background(...), not a Surface, so without
                        // this the notes render at LocalContentColor's black
                        // default regardless of theme.
                        CompositionLocalProvider(LocalContentColor provides MaterialTheme.colorScheme.onSurface) {
                            RichText(style = RichTextStyle.Default) {
                                Markdown(changelog)
                            }
                        }
                    }
                }
            }

            AlertRule()
            when (state) {
                is AppUpdateChecker.DownloadState.Downloading -> {
                    AlertAction(label = stringResource(R.string.cancel), emphasised = false, onClick = onCancelDownload)
                }
                is AppUpdateChecker.DownloadState.Ready -> {
                    AlertAction(label = stringResource(R.string.install_now), emphasised = true, onClick = onInstall)
                    AlertRule()
                    AlertAction(label = stringResource(R.string.later), emphasised = false, onClick = onDismiss)
                }
                is AppUpdateChecker.DownloadState.Failed -> {
                    AlertAction(label = stringResource(R.string.try_again), emphasised = true, onClick = onDownload)
                    AlertRule()
                    AlertAction(label = stringResource(R.string.open_releases_page), emphasised = false, onClick = onOpenReleasePage)
                }
                else -> {
                    AlertAction(label = stringResource(R.string.download_now), emphasised = true, onClick = onDownload)
                    AlertRule()
                    AlertAction(label = stringResource(R.string.remind_me_later), emphasised = false, onClick = onDismiss)
                }
            }
        }
    }
}

/**
 * Full-bleed action row. Tinted rather than filled, so the two read as equals
 * in weight and only the font differentiates the default action — the alert's
 * whole point is that neither choice is a trap.
 *
 * [destructive] is the one exception to that: an action that deletes something
 * is red in this lineage, because the point there *is* to break the symmetry.
 * It stays a plain row rather than a filled button, so it reads as a warning
 * and not as the thing to press.
 */
@Composable
internal fun AlertAction(
    label: String,
    emphasised: Boolean,
    onClick: () -> Unit,
    enabled: Boolean = true,
    destructive: Boolean = false,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(ACTION_HEIGHT)
            // iOS washes the whole row instead of drawing a ripple inside it.
            .background(
                if (pressed) MaterialTheme.colorScheme.onSurface.copy(alpha = 0.09f) else Color.Transparent,
            )
            .clickable(
                enabled = enabled,
                indication = null,
                interactionSource = interactionSource,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge.copy(
                fontSize = 17.sp,
                fontWeight = if (emphasised) FontWeight.W600 else FontWeight.W400,
            ),
            color = (if (destructive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
                .copy(alpha = if (enabled) 1f else 0.4f),
        )
    }
}

/** Hairline separator — [HorizontalDivider][androidx.compose.material3.HorizontalDivider]'s 1dp reads as a bar at this scale. */
@Composable
internal fun AlertRule(modifier: Modifier = Modifier) {
    Box(
        modifier
            .fillMaxWidth()
            .height(0.5.dp)
            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.14f)),
    )
}
