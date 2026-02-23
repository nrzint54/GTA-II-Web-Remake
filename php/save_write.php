<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

$raw = file_get_contents('php://input');
if ($raw === false || strlen($raw) === 0) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'empty body']);
  exit;
}

if (strlen($raw) > 200000) { // 200 KB
  http_response_code(413);
  echo json_encode(['ok' => false, 'error' => 'payload too large']);
  exit;
}

$data = json_decode($raw, true);
if (!is_array($data)) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'invalid json']);
  exit;
}

$slot = 'slot1';
if (isset($_GET['slot'])) {
  $slot = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$_GET['slot']);
  if ($slot === '') $slot = 'slot1';
}

$dir = __DIR__ . '/../saves';
if (!is_dir($dir)) mkdir($dir, 0775, true);

$path = $dir . '/' . $slot . '.json';
file_put_contents($path, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

echo json_encode(['ok' => true, 'slot' => $slot, 'bytes' => strlen($raw)]);
