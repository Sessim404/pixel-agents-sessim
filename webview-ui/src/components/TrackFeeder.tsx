/**
 * Sessim: passa as raias atuais para a pista de progresso desenhada no mapa.
 * Não desenha nada; o estado do escritório muda fora do React, então envia
 * de novo a cada intervalo curto.
 */

import { useEffect, useRef } from 'react';

import { getTrackLanesOverride, setTrackLanes } from '../office/engine/trackLanes.js';
import { buildLanes, type LaneSources } from '../sessimAgents.js';
import { ensureLula } from '../sessimLula.js';
import { setPlanUsage } from '../sessimPlanUsage.js';
import { transport } from '../transport/index.js';

const FEED_MS = 400;

// Uso do plano do Claude (faixa abaixo do título do quadro). Registrado ao
// carregar o módulo: no navegador o servidor responde ao webviewReady antes
// de o React montar.
transport.onMessage((msg) => {
  if (msg.type === 'sessimPlanUsage') setPlanUsage(msg);
});

export function TrackFeeder(props: LaneSources) {
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });
  useEffect(() => {
    // Raias simuladas (e2e/prévia) passam na frente do estado real.
    const feed = () => {
      ensureLula(latest.current.officeState);
      setTrackLanes(
        getTrackLanesOverride() ?? buildLanes({ ...latest.current, now: Date.now() }),
        performance.now(),
      );
    };
    feed();
    const t = setInterval(feed, FEED_MS);
    return () => clearInterval(t);
  }, []);
  return null;
}
