<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

$slot = 'slot1';
if (isset($_GET['slot'])) {
  $slot = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$_GET['slot']);
  if ($slot === '') $slot = 'slot1';
}

$path = __DIR__ . '/../saves/' . $slot . '.json';
if (!file_exists($path)) {
  http_response_code(404);
  echo json_encode(['ok' => false, 'error' => 'save not found', 'slot' => $slot]);
  exit;
}

$raw = file_get_contents($path);
if ($raw === false) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'read failed']);
  exit;
}

echo $raw;
