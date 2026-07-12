# Operação de produção

## Backups PostgreSQL

O serviço `backup` do Compose cria um dump completo assim que inicia e repete diariamente.
Arquivos ficam em `backups/`, com checksum SHA-256 e retenção padrão de 14 dias.

Verificar o último backup:

```bash
cd backups
sha256sum -c "$(ls -1t *.sha256 | head -1)"
```

Antes de restaurar produção, pare a API e preserve uma cópia do banco atual. Teste sempre o
arquivo em banco isolado primeiro. Exemplo de restauração em banco vazio:

```bash
pg_restore --exit-on-error --no-owner --no-privileges \
  --dbname="$DATABASE_URL" backups/renowa-YYYYMMDDTHHMMSSZ.dump
```

`BACKUP_RETENTION_DAYS` e `BACKUP_INTERVAL_SECONDS` podem ser definidos no `.env` da raiz.
Uma cópia externa criptografada continua necessária para cobrir perda total do servidor.
