#!/bin/sh
# Other kinds of video made from the reference clips, so the regression guard checks that
# the same logic holds whatever the footage looks like, not only on the clips as filmed:
# mirrored (a left-hander), lower resolution, trimmed, and a camera zoom added to a still
# camera. VP9-in-MP4, as headless Chromium can't decode H.264.
#   sh tests/e2e/make-variants.sh <clipDir>   (needs yt_vp9.mp4 and sq_vp9.mp4 there)
set -e
d="$1"
enc="-c:v libvpx-vp9 -b:v 2M -an"
ffmpeg -v error -y -i "$d/sq_vp9.mp4" -vf hflip $enc "$d/var_sq_mirror.mp4"
ffmpeg -v error -y -i "$d/sq_vp9.mp4" -vf scale=480:480 -c:v libvpx-vp9 -b:v 1M -an "$d/var_sq_480.mp4"
ffmpeg -v error -y -ss 16 -t 6 -i "$d/yt_vp9.mp4" -vf hflip $enc "$d/var_yt_mirror_trim.mp4"
ffmpeg -v error -y -ss 16 -t 6 -i "$d/yt_vp9.mp4" \
  -vf "scale=iw*2:ih*2,zoompan=z='min(1+0.008*on,1.35)':x='max(0,min(iw-iw/zoom,0.42*iw-iw/zoom/2))':y='max(0,min(ih-ih/zoom,0.42*ih-ih/zoom/2))':d=1:s=480x854:fps=30" \
  $enc "$d/var_yt_zoom.mp4"
