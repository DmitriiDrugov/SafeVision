"""
RTSP Stream Reader.

TODO: Implement StreamReader class:

    class StreamReader:
        def __init__(self, camera: Camera, publisher: FramePublisher) -> None:
            ...

        async def run(self) -> None:
            '''
            Main loop. Opens RTSP stream, decodes frames at fps_target,
            calls publisher.publish() for each frame.
            Reconnects on disconnect with exponential backoff (1s, 2s, 4s … 60s max).
            '''

        def _open_stream(self) -> av.container.InputContainer:
            '''
            Opens the RTSP URL with PyAV. Sets rtsp_transport=tcp for reliability.
            Raises av.error.AVError on failure.
            '''

        def _decode_frame(self, packet: av.Packet) -> numpy.ndarray | None:
            '''
            Decodes a PyAV packet to an RGB numpy array.
            Returns None if packet contains no video data.
            '''

        def _should_sample(self, frame_pts: int, stream_time_base: Fraction) -> bool:
            '''
            Returns True if this frame should be sampled given fps_target.
            Uses wall-clock comparison rather than PTS arithmetic to handle
            variable-frame-rate streams and seekable sources.
            '''

Prometheus metrics to emit:
    - frames_decoded_total{camera_id}: Counter
    - frames_published_total{camera_id}: Counter
    - stream_reconnects_total{camera_id}: Counter
    - active_streams: Gauge

Dependencies: av (PyAV), numpy, structlog, prometheus_client, asyncio
"""
