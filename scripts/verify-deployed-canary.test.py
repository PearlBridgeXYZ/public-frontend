import os,pathlib,subprocess,tempfile,unittest
SCRIPT=pathlib.Path(__file__).with_name('verify-deployed-canary.sh')
class CanaryGate(unittest.TestCase):
 def run_gate(self,branch,code):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d); stub=root/'python3'; calls=root/'calls'
   stub.write_text('#!/bin/sh\nprintf "%s\\n" "$*" > "$CALLS"\nexit "$TEST_EXIT"\n');stub.chmod(0o700)
   r=subprocess.run(['/bin/bash',str(SCRIPT),branch],env={'PATH':d+':/usr/bin:/bin','CALLS':str(calls),'TEST_EXIT':str(code)},capture_output=True,text=True)
   return r, calls.read_text() if calls.exists() else ''
 def test_matches(self):
  r,c=self.run_gate('main',0);self.assertEqual(r.returncode,0);self.assertEqual(c.strip(),'/home/openclaw/projects/pearlbridge-canary/check.py diff')
 def test_mismatch_blocks(self):
  r,c=self.run_gate('main',3);self.assertEqual(r.returncode,1);self.assertNotIn(' pin',c)
 def test_network_failure_blocks(self):
  r,c=self.run_gate('main',1);self.assertEqual(r.returncode,1);self.assertNotIn(' pin',c)
 def test_staging_does_not_repin_production(self):
  r,c=self.run_gate('next',3);self.assertEqual(r.returncode,0);self.assertEqual(c,'')
 def test_invalid_target_blocks(self):
  r,c=self.run_gate('invalid',0);self.assertEqual(r.returncode,2);self.assertEqual(c,'')
 def test_hook_after_upload(self):
  s=SCRIPT.with_name('deploy.sh').read_text();self.assertGreater(s.index('bash "$ROOT/scripts/verify-deployed-canary.sh"'),s.index('pages deploy dist'))
if __name__=='__main__':unittest.main()
