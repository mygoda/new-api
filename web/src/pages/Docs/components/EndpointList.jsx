import React from 'react';
import EndpointCard from './EndpointCard';
import { useServerAddress } from '../hooks';

/**
 * Renders a list of endpoint cards. Each endpoint can optionally include an
 * `intro` element rendered before the card and an `outro` element rendered
 * after, used for tables / banners that accompany a specific endpoint.
 */
const EndpointList = ({ endpoints }) => {
  const { serverAddress } = useServerAddress();
  return (
    <>
      {endpoints.map((ep, idx) => (
        <EndpointCard key={ep.id || ep.path || idx} endpoint={ep} serverAddress={serverAddress} />
      ))}
    </>
  );
};

export default EndpointList;
