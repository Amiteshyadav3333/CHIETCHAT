import io
import os
import unittest
from unittest.mock import Mock, patch

from werkzeug.datastructures import FileStorage

from content_moderation import ModerationUnavailable, check_adult_content, reject_adult_content


class ContentModerationTests(unittest.TestCase):
    def upload(self, name='photo.jpg', mimetype='image/jpeg'):
        return FileStorage(stream=io.BytesIO(b'media'), filename=name, content_type=mimetype)

    @patch.dict(os.environ, {'SIGHTENGINE_API_USER': 'user', 'SIGHTENGINE_API_SECRET': 'secret'}, clear=False)
    @patch('content_moderation.requests.post')
    def test_blocks_image_at_ninety_percent(self, post):
        response = Mock()
        response.json.return_value = {
            'status': 'success',
            'nudity': {'sexual_activity': 0.91, 'sexual_display': 0.02, 'erotica': 0.01},
        }
        post.return_value = response
        blocked, score = reject_adult_content(self.upload(), 'image')
        self.assertTrue(blocked)
        self.assertEqual(score, 0.91)

    @patch.dict(os.environ, {'SIGHTENGINE_API_USER': 'user', 'SIGHTENGINE_API_SECRET': 'secret'}, clear=False)
    @patch('content_moderation.requests.post')
    def test_uses_highest_video_frame_score(self, post):
        response = Mock()
        response.json.return_value = {
            'status': 'success',
            'data': {'frames': [
                {'nudity': {'erotica': 0.2}},
                {'nudity': {'sexual_display': 0.95}},
            ]},
        }
        post.return_value = response
        blocked, score = reject_adult_content(self.upload('clip.mp4', 'video/mp4'), 'video')
        self.assertTrue(blocked)
        self.assertEqual(score, 0.95)
        self.assertIn('video/check-sync.json', post.call_args.args[0])

    @patch.dict(os.environ, {
        'SIGHTENGINE_API_USER': '', 'SIGHTENGINE_API_SECRET': '',
        'CONTENT_MODERATION_REQUIRED': 'true',
    }, clear=False)
    def test_fails_closed_when_required_provider_is_missing(self):
        with self.assertRaises(ModerationUnavailable):
            check_adult_content(self.upload(), 'image')


if __name__ == '__main__':
    unittest.main()
