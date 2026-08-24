<?php
// Router para o servidor embutido do PHP (somente desenvolvimento):
//   php -S localhost:8000 router.php
// Ele normaliza a rota e encaminha tudo para o index.php.
$_SERVER['PATH_INFO'] = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
require __DIR__ . '/index.php';
