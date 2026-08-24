# O que perguntar ao TI da UFRGS (hospedagem do sistema)

O backend é em **Python/FastAPI** + banco relacional. Para confirmar que roda no
servidor da UFRGS — e como fazer o deploy —, leve estas perguntas ao setor de TI/CPD.

## 1. Tipo de ambiente
- [ ] É uma **máquina virtual (VM) / servidor Linux** com acesso via SSH onde
      podemos instalar programas? **(ideal para FastAPI)**
- [ ] Ou é uma **hospedagem compartilhada** (tipo cPanel), que normalmente só roda
      **PHP**? *(se for só isso, precisaríamos reavaliar a linguagem do backend)*
- [ ] Existe suporte a **Docker/containers**? (facilita muito o deploy)

## 2. Python
- [ ] Qual versão do **Python** está disponível? (precisamos de 3.10+)
- [ ] Podemos rodar um **processo próprio** (servidor uvicorn/gunicorn) de forma
      contínua? Há **systemd** ou algo para manter o serviço no ar?

## 3. Banco de dados
- [ ] Qual banco a UFRGS oferece: **PostgreSQL** ou **MySQL/MariaDB**?
- [ ] Eles criam o banco para nós ou temos que instalar? Qual host/porta/credenciais?
- [ ] Há **backup automático**? Com que frequência?

## 4. Rede e acesso
- [ ] O sistema ficará acessível **só na rede da UFRGS (VPN)** ou **pela internet**?
- [ ] Conseguimos um **subdomínio** (ex.: `enfitec-horas.ufrgs.br`)?
- [ ] Há **HTTPS/certificado** disponível? (necessário para segurança dos logins)
- [ ] Existe um **proxy reverso** (nginx/apache) que podemos usar na frente da API?

## 5. E-mail (para o login por link mágico)
- [ ] Podemos usar um **servidor SMTP** da UFRGS para enviar os e-mails de acesso?
      (host, porta, usuário, se exige autenticação)
- [ ] Ou usamos uma conta de e-mail da EJ (ex.: Gmail) como remetente?

## 6. Processo e responsáveis
- [ ] Como é feito o **deploy/atualização** (SSH manual, Git, pipeline)?
- [ ] Quem é o **contato responsável** pela hospedagem para dúvidas futuras?
- [ ] Há alguma **política de uso** (limites de CPU/RAM/disco, dados sensíveis/LGPD)?

---

## Resumo do que o sistema precisa (para mostrar ao TI)

| Necessidade | Detalhe |
|---|---|
| Rodar Python | Versão 3.10+ com um processo de servidor (uvicorn) sempre ativo |
| Banco relacional | PostgreSQL (preferível) ou MySQL/MariaDB |
| HTTPS | Certificado + domínio/subdomínio |
| SMTP | Para enviar os links de acesso por e-mail |
| Recursos | Muito baixos: ~1 vCPU e 512 MB–1 GB de RAM já sobra para ~40 usuários |

> Enquanto o ambiente não é confirmado, o backend **já roda localmente com SQLite**
> (ver `backend/README.md`). Na produção, basta trocar a variável `DATABASE_URL`
> para o banco da UFRGS e instalar o driver correspondente.
