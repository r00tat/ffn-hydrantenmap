'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  createFirecallShareLink,
  issueFirecallShareLinkUrl,
  listFirecallShareLinks,
  updateFirecallShareLink,
  type CreateFirecallShareLinkOptions,
  type UpdateFirecallShareLinkOptions,
} from '../../app/actions/firecallShareLinks';
import type { FirecallShareLink } from '../../common/firecallShareLink';

/**
 * Lädt und verändert die Share-Links eines Einsatzes.
 *
 * `loadFailed` ist bewusst von „keine Links" getrennt: ein stilles `[]` bei
 * einem Ladefehler verleitet dazu, einen längst existierenden Zugang zu
 * übersehen und einen zweiten zu erzeugen.
 */
export default function useFirecallShareLinks(firecallId: string) {
  const [links, setLinks] = useState<FirecallShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      setLinks(await listFirecallShareLinks(firecallId));
    } catch (err) {
      console.error('Failed to load firecall share links:', err);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [firecallId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const create = useCallback(
    async (options: CreateFirecallShareLinkOptions) => {
      setBusy(true);
      try {
        const { link } = await createFirecallShareLink(firecallId, options);
        await reload();
        return link;
      } finally {
        setBusy(false);
      }
    },
    [firecallId, reload]
  );

  const update = useCallback(
    async (uid: string, options: UpdateFirecallShareLinkOptions) => {
      setBusy(true);
      try {
        await updateFirecallShareLink(firecallId, uid, options);
        await reload();
      } finally {
        setBusy(false);
      }
    },
    [firecallId, reload]
  );

  const issueUrl = useCallback(
    async (uid: string) => {
      const { link } = await issueFirecallShareLinkUrl(firecallId, uid);
      return link;
    },
    [firecallId]
  );

  return { links, loading, loadFailed, busy, reload, create, update, issueUrl };
}
