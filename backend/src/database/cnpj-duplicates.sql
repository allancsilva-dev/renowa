-- Relatório pré-0046. Execute no banco alvo antes de db:migrate.
-- Cada linha precisa ser saneada, mantendo cadastro canônico e excluindo
-- logicamente os demais antes de criar os índices únicos.
SELECT 'clientes' AS categoria, tenant_id,
       regexp_replace(cnpj, '\D', '', 'g') AS cnpj,
       array_agg(uuid ORDER BY created_at) AS uuids,
       count(*) AS total
FROM public.clientes
WHERE deleted_at IS NULL AND NULLIF(regexp_replace(COALESCE(cnpj, ''), '\D', '', 'g'), '') IS NOT NULL
GROUP BY tenant_id, regexp_replace(cnpj, '\D', '', 'g')
HAVING count(*) > 1
UNION ALL
SELECT 'fornecedores', tenant_id,
       regexp_replace(cnpj, '\D', '', 'g'),
       array_agg(uuid ORDER BY created_at), count(*)
FROM public.fornecedores
WHERE deleted_at IS NULL AND NULLIF(regexp_replace(COALESCE(cnpj, ''), '\D', '', 'g'), '') IS NOT NULL
GROUP BY tenant_id, regexp_replace(cnpj, '\D', '', 'g')
HAVING count(*) > 1
UNION ALL
SELECT 'transportadoras', tenant_id,
       regexp_replace(cnpj, '\D', '', 'g'),
       array_agg(uuid ORDER BY created_at), count(*)
FROM public.transportadoras
WHERE deleted_at IS NULL AND NULLIF(regexp_replace(COALESCE(cnpj, ''), '\D', '', 'g'), '') IS NOT NULL
GROUP BY tenant_id, regexp_replace(cnpj, '\D', '', 'g')
HAVING count(*) > 1
ORDER BY categoria, tenant_id, cnpj;
