import React from 'react';

import { ViewCubeContainer } from './ViewCube.styles';

const ViewCube = ({ tweenCamera }) => {
  return (
    <ViewCubeContainer>
      <div className='cube'>
        <div
          className='cube__face cube__face--front'
          onClick={() => tweenCamera(FRONT)}
        >
          front
        </div>
        <div
          className='cube__face cube__face--back'
          onClick={() => tweenCamera(BACK)}
        >
          back
        </div>
        <div
          className='cube__face cube__face--right'
          onClick={() => tweenCamera(RIGHT)}
        >
          right
        </div>
        <div
          className='cube__face cube__face--left'
          onClick={() => tweenCamera(LEFT)}
        >
          left
        </div>
        <div
          className='cube__face cube__face--top'
          onClick={() => tweenCamera(TOP)}
        >
          top
        </div>
        <div
          className='cube__face cube__face--bottom'
          onClick={() => tweenCamera(BOTTOM)}
        >
          bottom
        </div>
      </div>
    </ViewCubeContainer>
  );
};

export default ViewCube;
