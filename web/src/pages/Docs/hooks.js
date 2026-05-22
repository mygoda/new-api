import { useContext } from 'react';
import { StatusContext } from '../../context/Status';

export const useServerAddress = () => {
  const [statusState] = useContext(StatusContext);
  const configured = statusState?.status?.server_address || '';
  return {
    serverAddress: configured || 'https://your-domain.com',
    serverAddressMissing: !configured,
  };
};

export const usePageTitle = () => useContext(StatusContext);
