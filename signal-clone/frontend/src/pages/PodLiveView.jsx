import React from 'react';
import PodLiveApp from '../features/podlive/PodLiveApp';

const PodLiveView = ({ active, onBack, incomingInvite, onInviteConsumed }) => {
    return <PodLiveApp active={active} onBack={onBack} incomingInvite={incomingInvite} onInviteConsumed={onInviteConsumed} />;
};

export default PodLiveView;
