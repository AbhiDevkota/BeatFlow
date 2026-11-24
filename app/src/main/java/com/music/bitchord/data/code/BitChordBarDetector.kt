package com.music.bitchord.data.code

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Bounding box of a candidate vertical bar in the camera frame.
 */
data class BarBox(
    var x: Int,
    var y: Int,
    var w: Int,
    var h: Int,
    var area: Int,
) {
    val centerX: Float get() = x + w / 2f
    val centerY: Float get() = y + h / 2f
    val right: Int get() = x + w
    val bottom: Int get() = y + h
}

/**
 * High-performance real-time detector for BitChord visual soundwave codes from camera frames.
 *
 * Employs a dual-pass detection strategy:
 * 1. 2D Connected Component Analysis with adaptive thresholding: detects vertical bar bounding
 *    boxes and groups them into 30-bar arithmetic grids.
 * 2. Multi-scanline peak profiling with vertical tracing: detects periodic oscillation of bars
 *    and measures vertical heights directly.
 *
 * Candidate sequences are validated with 8-bit CRC checksums and strict length verification
 * via [BitChordCodec], ensuring zero false positives.
 */
object BitChordBarDetector {

    fun detect(
        yuvBytes: ByteArray,
        width: Int,
        height: Int,
    ): BitChordCodec.Payload? {
        if (width < 100 || height < 100 || yuvBytes.size < width * height) return null

        // Pass 1: Connected Component Analysis
        detectByComponents(yuvBytes, width, height)?.let { return it }

        // Pass 2: Scanline peak profiling
        detectByScanlines(yuvBytes, width, height)?.let { return it }

        return null
    }

    /**
     * Pass 1: Identifies 2D candidate vertical bar bounding boxes using adaptive thresholding
     * and connected component labeling, then groups horizontally aligned sequences of 30 bars.
     */
    private fun detectByComponents(
        yuvBytes: ByteArray,
        width: Int,
        height: Int,
    ): BitChordCodec.Payload? {
        // Viewfinder region (middle 85% width, middle 60% height)
        val roiX = (width * 0.05f).toInt()
        val roiY = (height * 0.18f).toInt()
        val roiW = (width * 0.90f).toInt()
        val roiH = (height * 0.64f).toInt()
        val total = roiW * roiH
        if (total <= 0) return null

        val otsu = computeOtsuThreshold(yuvBytes, roiX, roiY, roiW, roiH, width)

        val binary = BooleanArray(total)
        val visited = BooleanArray(total)
        val queueX = IntArray(total)
        val queueY = IntArray(total)

        // Test around Otsu threshold: otsu, otsu - 20, otsu + 20
        val thresholds = intArrayOf(otsu, (otsu - 20).coerceAtLeast(30), (otsu + 20).coerceAtMost(235))

        for (threshold in thresholds) {
            for (y in 0 until roiH) {
                val rowOffset = (roiY + y) * width + roiX
                val binRow = y * roiW
                for (x in 0 until roiW) {
                    val v = yuvBytes[rowOffset + x].toInt() and 0xFF
                    binary[binRow + x] = v >= threshold
                }
            }

            visited.fill(false)
            val candidates = ArrayList<BarBox>()

            for (y in 0 until roiH) {
                val binRow = y * roiW
                for (x in 0 until roiW) {
                    val idx = binRow + x
                    if (!binary[idx] || visited[idx]) continue

                    var minX = x
                    var maxX = x
                    var minY = y
                    var maxY = y
                    var area = 0

                    var head = 0
                    var tail = 0
                    queueX[tail] = x
                    queueY[tail] = y
                    tail++
                    visited[idx] = true

                    while (head < tail) {
                        val qx = queueX[head]
                        val qy = queueY[head]
                        head++
                        area++

                        if (qx < minX) minX = qx
                        if (qx > maxX) maxX = qx
                        if (qy < minY) minY = qy
                        if (qy > maxY) maxY = qy

                        if (qx + 1 < roiW) {
                            val n = qy * roiW + (qx + 1)
                            if (binary[n] && !visited[n]) {
                                visited[n] = true
                                queueX[tail] = qx + 1; queueY[tail] = qy; tail++
                            }
                        }
                        if (qx - 1 >= 0) {
                            val n = qy * roiW + (qx - 1)
                            if (binary[n] && !visited[n]) {
                                visited[n] = true
                                queueX[tail] = qx - 1; queueY[tail] = qy; tail++
                            }
                        }
                        if (qy + 1 < roiH) {
                            val n = (qy + 1) * roiW + qx
                            if (binary[n] && !visited[n]) {
                                visited[n] = true
                                queueX[tail] = qx; queueY[tail] = qy + 1; tail++
                            }
                        }
                        if (qy - 1 >= 0) {
                            val n = (qy - 1) * roiW + qx
                            if (binary[n] && !visited[n]) {
                                visited[n] = true
                                queueX[tail] = qx; queueY[tail] = qy - 1; tail++
                            }
                        }
                    }

                    val bw = maxX - minX + 1
                    val bh = maxY - minY + 1

                    // Vertical bar filter: must be slender and reasonably tall
                    if (bh >= 10 && bw in 2..(roiW * 0.06f).toInt() && (bh.toFloat() / max(bw, 1)) >= 1.25f && area >= 18) {
                        candidates.add(BarBox(minX, minY, bw, bh, area))
                    }
                }
            }

            if (candidates.size < 20) continue
            candidates.sortBy { it.x }

            // Merge split vertical fragments belonging to the same bar
            val merged = ArrayList<BarBox>()
            for (bar in candidates) {
                if (merged.isEmpty()) {
                    merged.add(bar)
                    continue
                }
                val prev = merged.last()
                val gap = bar.x - prev.right
                val overlap = min(prev.bottom, bar.bottom) - max(prev.y, bar.y)
                if (gap <= 3 && overlap > 0) {
                    val nx = min(prev.x, bar.x)
                    val ny = min(prev.y, bar.y)
                    val nr = max(prev.right, bar.right)
                    val nb = max(prev.bottom, bar.bottom)
                    prev.x = nx
                    prev.y = ny
                    prev.w = nr - nx
                    prev.h = nb - ny
                    prev.area += bar.area
                } else {
                    merged.add(bar)
                }
            }

            if (merged.size < 20) continue

            // Find chains of bars that align along a single horizontal baseline
            val chains = findAlignedComponentChains(merged)
            for (chain in chains) {
                // Check if chain length is close to standard 30 bars
                if (chain.size !in 26..34) continue

                // Check uniform pitch
                val span = chain.last().centerX - chain.first().centerX
                val expectedPitch = span / (chain.size - 1)
                if (expectedPitch < 3f || expectedPitch > 50f) continue

                // Check grid deviation: max deviation of any bar from regular grid
                var maxDev = 0f
                for (k in chain.indices) {
                    val expectedX = chain.first().centerX + k * expectedPitch
                    val dev = abs(chain[k].centerX - expectedX)
                    if (dev > maxDev) maxDev = dev
                }
                if (maxDev > expectedPitch * 0.45f) continue

                // If chain is 30 bars, evaluate directly
                if (chain.size == 30) {
                    val heights = FloatArray(30) { chain[it].h.toFloat() }
                    tryDecodeHeights(heights)?.let { return it }
                }

                // If chain is 28-32 bars, test sub-slices of length 30
                if (chain.size > 30) {
                    for (start in 0..(chain.size - 30)) {
                        val sub = FloatArray(30) { chain[start + it].h.toFloat() }
                        tryDecodeHeights(sub)?.let { return it }
                    }
                }
            }
        }

        return null
    }

    private fun computeOtsuThreshold(
        yuvBytes: ByteArray,
        roiX: Int,
        roiY: Int,
        roiW: Int,
        roiH: Int,
        width: Int,
    ): Int {
        val histogram = IntArray(256)
        var totalPixels = 0
        for (y in 0 until roiH step 2) {
            val rowOffset = (roiY + y) * width + roiX
            for (x in 0 until roiW step 2) {
                val v = yuvBytes[rowOffset + x].toInt() and 0xFF
                histogram[v]++
                totalPixels++
            }
        }
        if (totalPixels == 0) return 128

        var sum = 0.0
        for (i in 0 until 256) {
            sum += i * histogram[i]
        }

        var sumB = 0.0
        var wB = 0
        var varMax = 0.0
        var threshold = 128

        for (t in 0 until 256) {
            wB += histogram[t]
            if (wB == 0) continue
            val wF = totalPixels - wB
            if (wF == 0) break

            sumB += t * histogram[t]
            val mB = sumB / wB
            val mF = (sum - sumB) / wF

            val varBetween = wB.toDouble() * wF.toDouble() * (mB - mF) * (mB - mF)
            if (varBetween > varMax) {
                varMax = varBetween
                threshold = t
            }
        }
        return threshold
    }

    private fun findAlignedComponentChains(bars: List<BarBox>): List<List<BarBox>> {
        val result = ArrayList<List<BarBox>>()
        val visited = BooleanArray(bars.size)

        for (i in bars.indices) {
            if (visited[i]) continue
            val chain = ArrayList<BarBox>()
            chain.add(bars[i])

            var current = bars[i]
            for (j in (i + 1) until bars.size) {
                val next = bars[j]
                val gap = next.x - current.right
                val maxGap = max(current.w, next.w) * 5 + 30
                val dy = abs(next.centerY - current.centerY)
                val maxDy = max(current.h, next.h) * 0.45f + 10f

                if (gap in 0..maxGap && dy <= maxDy) {
                    chain.add(next)
                    current = next
                }
            }

            if (chain.size >= 25) {
                for (b in chain) {
                    val idx = bars.indexOf(b)
                    if (idx >= 0) visited[idx] = true
                }
                result.add(chain)
            }
        }
        return result
    }

    /**
     * Pass 2: Analyzes horizontal scanlines through the viewfinder looking for 30 consecutive
     * uniformly-spaced peaks and measuring the vertical height of each peak.
     */
    private fun detectByScanlines(
        yuvBytes: ByteArray,
        width: Int,
        height: Int,
    ): BitChordCodec.Payload? {
        val roiLeft = (width * 0.05f).toInt()
        val roiRight = (width * 0.95f).toInt()
        val roiTop = (height * 0.20f).toInt()
        val roiBottom = (height * 0.80f).toInt()
        val roiW = roiRight - roiLeft
        if (roiW < 100) return null

        val row = IntArray(roiW)
        val smooth = IntArray(roiW)

        // Scanlines spaced by 3 pixels vertically for fine resolution
        for (y in roiTop..roiBottom step 3) {
            val rowOffset = y * width

            for (x in 0 until roiW) {
                row[x] = yuvBytes[rowOffset + roiLeft + x].toInt() and 0xFF
            }

            // 3-point moving average smoothing: (r[x-1] + 2*r[x] + r[x+1]) / 4
            smooth[0] = row[0]
            smooth[roiW - 1] = row[roiW - 1]
            for (x in 1 until roiW - 1) {
                smooth[x] = (row[x - 1] + (row[x] shl 1) + row[x + 1]) shr 2
            }

            // Find local peaks
            val peakIndices = ArrayList<Int>()
            val peakBgVals = ArrayList<Int>()
            var lastPeak = -100

            for (x in 2 until roiW - 2) {
                val v = smooth[x]
                if (v >= smooth[x - 1] && v > smooth[x + 1] && (x - lastPeak) >= 3) {
                    var minLeft = v
                    var leftX = x
                    var k = x - 1
                    while (k >= 0 && k >= x - 35) {
                        if (smooth[k] < minLeft) {
                            minLeft = smooth[k]
                            leftX = k
                        } else if (smooth[k] > minLeft + 4) {
                            break
                        }
                        k--
                    }

                    var minRight = v
                    var rightX = x
                    k = x + 1
                    while (k < roiW && k <= x + 35) {
                        if (smooth[k] < minRight) {
                            minRight = smooth[k]
                            rightX = k
                        } else if (smooth[k] > minRight + 4) {
                            break
                        }
                        k++
                    }

                    val localBg = max(minLeft, minRight)
                    val contrast = v - localBg
                    if (contrast >= 10) {
                        val barCenterX = (leftX + rightX) / 2
                        peakIndices.add(roiLeft + barCenterX)
                        peakBgVals.add(localBg)
                        lastPeak = x
                    }
                }
            }

            if (peakIndices.size < 28) continue

            // Find chains of ~30 uniformly spaced peaks
            val chains = findScanlineChains(peakIndices, peakBgVals)
            for (chainPair in chains) {
                val chain = chainPair.first
                val chainBg = chainPair.second
                if (chain.size !in 28..34) continue

                // Verify uniform pitch
                val span = chain.last() - chain.first()
                val pitch = span.toFloat() / (chain.size - 1)
                if (pitch < 3f || pitch > 45f) continue

                // Measure vertical height of each bar
                val barHeights = FloatArray(chain.size)
                var validCount = 0

                for (i in chain.indices) {
                    val px = chain[i]
                    val peakVal = yuvBytes[y * width + px].toInt() and 0xFF
                    val bgVal = chainBg.getOrElse(i) { 0 }
                    val contrast = (peakVal - bgVal).coerceAtLeast(10)
                    val cutoff = bgVal + (contrast * 0.35f).toInt()

                    var upY = y
                    val maxTravel = height / 3
                    while (upY > max(0, y - maxTravel)) {
                        val lum = yuvBytes[upY * width + px].toInt() and 0xFF
                        if (lum < cutoff) break
                        upY--
                    }

                    var downY = y
                    while (downY < min(height - 1, y + maxTravel)) {
                        val lum = yuvBytes[downY * width + px].toInt() and 0xFF
                        if (lum < cutoff) break
                        downY++
                    }

                    val bh = (downY - upY).toFloat()
                    barHeights[i] = bh
                    if (bh >= 6f) validCount++
                }

                if (validCount < 26) continue

                if (chain.size == 30) {
                    tryDecodeHeights(barHeights)?.let { return it }
                } else if (chain.size > 30) {
                    for (start in 0..(chain.size - 30)) {
                        val sub = FloatArray(30) { barHeights[start + it] }
                        tryDecodeHeights(sub)?.let { return it }
                    }
                }
            }
        }

        return null
    }

    private fun findScanlineChains(
        peaks: List<Int>,
        bgs: List<Int>,
    ): List<Pair<List<Int>, List<Int>>> {
        val result = ArrayList<Pair<List<Int>, List<Int>>>()
        var currentChain = ArrayList<Int>()
        var currentBg = ArrayList<Int>()

        for (i in peaks.indices) {
            if (currentChain.isEmpty()) {
                currentChain.add(peaks[i])
                currentBg.add(bgs[i])
                continue
            }
            val gap = peaks[i] - currentChain.last()
            if (gap in 3..45) {
                currentChain.add(peaks[i])
                currentBg.add(bgs[i])
            } else {
                if (currentChain.size >= 26) {
                    result.add(Pair(currentChain, currentBg))
                }
                currentChain = ArrayList()
                currentBg = ArrayList()
                currentChain.add(peaks[i])
                currentBg.add(bgs[i])
            }
        }
        if (currentChain.size >= 26) {
            result.add(Pair(currentChain, currentBg))
        }
        return result
    }

    private fun tryDecodeHeights(h: FloatArray): BitChordCodec.Payload? {
        if (h.size != 30) return null

        // 1. Forward direction: first bar is 0, last bar is 7
        tryDecodeDirection(h)?.let { return it }

        // 2. Reversed direction: phone held upside down
        val rev = FloatArray(h.size) { h[h.size - 1 - it] }
        tryDecodeDirection(rev)?.let { return it }

        return null
    }

    private fun tryDecodeDirection(h: FloatArray): BitChordCodec.Payload? {
        val lowBase = h.first()
        val highBase = h.last()
        if (highBase <= lowBase + 5f) return null

        // Test base calibration and slight 1px delta variations for camera discretization resilience
        for (dLow in floatArrayOf(0f, -1f, 1f)) {
            for (dHigh in floatArrayOf(0f, 1f, -1f)) {
                val low = lowBase + dLow
                val high = highBase + dHigh
                if (high <= low + 5f) continue

                val levels = ArrayList<Int>(h.size)
                for (v in h) {
                    val scaled = ((v - low) / (high - low)) * 7f
                    levels.add(scaled.roundToInt().coerceIn(0, 7))
                }
                if (levels.first() == 0 && levels.last() == 7) {
                    val payload = runCatching { BitChordCodec.decode(levels) }.getOrNull()
                    if (payload != null) return payload
                }
            }
        }
        return null
    }
}
