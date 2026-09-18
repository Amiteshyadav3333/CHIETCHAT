import React from 'react';
import PodLiveApp from '../features/podlive/PodLiveApp';

const PodLiveView = ({ active, onBack, incomingInvite, onInviteConsumed, token }) => {
    return <PodLiveApp active={active} onBack={onBack} incomingInvite={incomingInvite} onInviteConsumed={onInviteConsumed} cheetchatToken={token} />;
};

export default PodLiveView;
