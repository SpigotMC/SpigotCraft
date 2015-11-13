<?php
ob_start();
require_once('MySQL_funcs.php');
include('MySQL_config.php');
require('MySQL_getlogin.php');
ob_end_clean();

session_start();

if(isset($_POST['j_password'])) {
  $password = $_POST['j_password'];
}
else {
  $password = '';
}
if(isset($_POST['j_verify_password'])) {
  $verify = $_POST['j_verify_password'];
}
else {
  $verify = '';
}
if(strcmp($password, $verify)) {
  echo "{ \"result\": \"verifyfailed\" }"; 
  return;
}

if(isset($_POST['j_username'])) {
  $userid = $_POST['j_username'];
}
else {
  $userid = '-guest-';
}
if(isset($_POST['j_passcode'])) {
  $passcode = $_POST['j_passcode'];
}
else {
  $passcode = '';
}
$good = false;

$useridlc = strtolower($userid);

$_SESSION['userid'] = '-guest-';

$good = false;

if(strcmp($useridlc, '-guest-')) {
  if(isset($pendingreg[$useridlc])) {
     if(!strcmp($passcode, $pendingreg[$useridlc])) {
        $ctx = hash_init('sha256');
        hash_update($ctx, $pwdsalt);
        hash_update($ctx, $password);
        $hash = hash_final($ctx);
        $_SESSION['userid'] = $userid;
        $good = true;
		$newlines[] = array();
		$content = getStandaloneFile('dynmap_reg.php');
		if (isset($content)) {
		    $lines = explode('\n', $content);
		    $isnew = false;
		}
		else {
		    $lines = array();
		    $isnew = true;
		}
		if(!empty($lines)) {
			$cnt = count($lines) - 1;
			for($i=1; $i < $cnt; $i++) {
				list($uid, $pc, $hsh) = split('=', rtrim($lines[$i]));
				if($uid == $useridlc) continue;
				if(array_key_exists($uid, $pendingreg)) {
					$newlines[] = $uid . '=' . $pc . '=' . $hsh;
				}
			}
		}
		$newlines[] = $useridlc . '=' . $passcode . '=' . $hash;
		if ($isnew) {
			insertStandaloneFile('dynmap_reg.php', implode("\n", $newlines));
		}
		else {		
			updateStandaloneFile('dynmap_reg.php', implode("\n", $newlines));
		}
     }
  }
}
if($good) {
   echo "{ \"result\": \"success\" }"; 
}
else {
   echo "{ \"result\": \"registerfailed\" }"; 
}
cleanupDb();
   
?>