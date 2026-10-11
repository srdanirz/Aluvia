-- address_key read "10.745" as number 10, so a report never met its official parcel 10745.
-- Thousands dots between digits are joined first; the rest is migration 0016 unchanged.
CREATE OR REPLACE FUNCTION address_key(address text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
  SELECT m[1] || ' ' || m[2]
  FROM regexp_match(
    regexp_replace(
      regexp_replace(
        ' ' || trim(regexp_replace(
          upper(translate(
            regexp_replace(address, '([0-9])\.([0-9]{3})(?![0-9])', '\1\2', 'g'),
            'áàäâéèëêíìïîóòöôúùüûñÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑ', 'aaaaeeeeiiiioooouuuunAAAAEEEEIIIIOOOOUUUUN')),
          '[^A-Z0-9]+', ' ', 'g')) || ' ',
        '^ (AVENIDA|AVDA|AV|CALLE|PASAJE|PSJE|PJE|CAMINO) ', ' '),
      ' (N|NO|NRO|NUM|NUMERO) ([0-9])', ' \2', 'g'),
    '^ ([A-Z][A-Z ]*[A-Z]|[A-Z]) ([0-9]+) ') AS m
$$;
--> statement-breakpoint
-- The stored generated column keeps the old key until its row is written again.
UPDATE worksite_contacts SET address_text = address_text WHERE address_text ~ '[0-9]\.[0-9]{3}';
