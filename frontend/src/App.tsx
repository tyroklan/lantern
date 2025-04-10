import { useState } from 'react';
import './App.css';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import React from 'react';
import TradingNetworkForceGraph from './components/TradingNetworkForceGraph';

interface SimulationParams {
  community_size: number;
  season: string;
  pv_percentage: number;
  sd_percentage: number;
  with_battery: boolean;
}

interface SimulationResult {
  trading_network: TradingNetwork;
  energy_metrics: {
    total_production: number;
    total_consumption: number;
    total_grid_import: number;
    total_grid_export: number;
  };
  cost_metrics: {
    cost_with_lec: number;
    cost_without_lec: number;
  };
  market_metrics: {
    trading_volume: number;
    ratio_fulfilled_demand: number;
    ratio_sold_supply: number;
  };
  profiles: {
    load_profile: number[];
    gen_profile: number[];
  }
  warnings: string[];
  errors: string[];
}

interface TradingNetwork {
  edges: Array<[string, string, number]>;
  nodes: string[];
  layout: Record<string, [number, number]>;
}

const SEASON_SYMBOLS: Record<string, string> = {
  'sum': '☀️',  // sun for summer
  'win': '❄️',  // snowflake for winter
  'aut': '🍂',  // leaf for autumn
  'spr': '🌸',  // flower for spring
};

const BatteryIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="currentColor"  // This will inherit the color from the parent
  >
    <path d="M20 10V8A2 2 0 0 0 18 6H4A2 2 0 0 0 2 8V16A2 2 0 0 0 4 18H18A2 2 0 0 0 20 16V14H22V10H20M18 16H4V8H18V16M6 10V14H16V10H6Z" />
  </svg>
);

const descLEC = "A local energy community (LEC) is a group of households that come together to share and manage their energy resources. Would you like to join one? ​";
const descSize = "The size of a local energy community refers to the number of households that choose to join and participate in it. What size will you choose? ​";
const descSeason = "The season has a big impact on both the amount of electricity solar panels can generate and the electricity needs of each household. What season do you want to try?";
const descSD = "Smart devices, such as washing machines and dishwashers, can be programmed to run when the solar panels are generating energy, making their usage more efficient. How many of the members will have some smart devices? ​";
const descPV = "Not all members of a local energy community need to have solar panels, some can simply purchase electricity from their neighbors, promoting local energy use. How many of the members will have solar panels? ​";
const descBattery = "Hit the Shared Battery button if you want your LEC to have one.​";
const descConfirm = "When you are done, press Confirm and wait to see your Local Energy Community appearing.​";



// Add this new component for the cost comparison bars
const CostComparison = ({ withLec, withoutLec }: { withLec: number, withoutLec: number }) => {
  // Calculate savings percentage
  const savings = withoutLec - withLec;
  const savingsPercent = (savings / withoutLec) * 100;

  // For visual clarity, use a more moderate scaling factor
  // This will make the difference visible but not exaggerated
  const withLecWidth = (withLec / withoutLec) * 100 - 11;

  // Debug width of the bar
  // console.log("Debug - withLec:", withLec, "withoutLec:", withoutLec);
  // console.log("Debug - savings:", savings, "savingsPercent:", savingsPercent);
  // console.log("Debug - withLecWidth:", withLecWidth);

  return (
    <div className="cost-comparison">
      {/* Add a debug display that's only visible during development */}
      {/* {process.env.NODE_ENV === 'development' && (
        <div className="debug-info" style={{ fontSize: '12px', color: '#666', marginBottom: '10px', fontFamily: 'monospace' }}>
          Debug: withLec={withLec.toFixed(2)} withoutLec={withoutLec.toFixed(2)} savings={savings.toFixed(2)} ({savingsPercent.toFixed(2)}%) width={withLecWidth.toFixed(2)}%
        </div>
      )} */}

      <div className="bar-container">
        <div className="bar-label">With Community</div>
        <div className="bar-wrapper">
          <div
            className="bar lec-bar"
            style={{ width: `${withLecWidth}%` }}
          >
            <span>{withLec.toFixed(2)} CHF</span>
          </div>
        </div>
      </div>
      <div className="bar-container">
        <div className="bar-label">Without Community</div>
        <div className="bar-wrapper">
          <div
            className="bar no-lec-bar"
            style={{ width: '100%' }}
          >
            <span>{withoutLec.toFixed(2)} CHF</span>
          </div>
        </div>
      </div>

      {savings > 0 && (
        <div className="savings-info">
          <span>You save {savingsPercent.toFixed(1)}% with community</span>
        </div>
      )}
    </div>
  );
};

const LoadGenProfile = ({ loadProfile, genProfile }: { loadProfile: number[], genProfile: number[] }) => {
  // Prepare data for the chart
  const data = loadProfile.map((load, index) => ({
    time: index, // Assuming index represents the hour of the day
    load,
    generation: genProfile[index],
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="time" domain={[0, 23]} tickFormatter={(tick) => `${tick}:00`} />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="load" stroke="#8884d8" name="Load (kW)" />
        <Line type="monotone" dataKey="generation" stroke="#82ca9d" name="Generation (kW)" />
      </LineChart>
    </ResponsiveContainer>
  );
};

function App() {
  const [results, setResults] = useState<SimulationResult[]>([]);
  const [selectedResultIndex, setSelectedResultIndex] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<SimulationParams>({
    community_size: 10,
    season: 'sum',
    pv_percentage: 50,
    sd_percentage: 25,
    with_battery: false,
  });

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setParams((prev) => ({ ...prev, [name]: Number(value) }));
  };

  const handleButtonClick = (name: string, value: any) => {
    setParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleCircleSliderChange = (e: React.MouseEvent<HTMLDivElement>, name: string) => {
    // Store the circle element reference
    const circle = e.currentTarget;

    const updateValue = (e: MouseEvent | React.MouseEvent) => {
      const rect = circle.getBoundingClientRect();  // Use stored circle reference
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
      let percentage = ((angle + Math.PI) / (2 * Math.PI)) * 100;
      percentage = (percentage + 75) % 100;

      setParams(prev => ({ ...prev, [name]: Math.round(percentage) }));
    };

    // Handle initial click
    updateValue(e);

    // Setup mouse move tracking
    const handleMouseMove = (e: MouseEvent) => updateValue(e);
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    console.log('Form submitted');

    const submissionParams: SimulationParams = {
      community_size: params.community_size,
      season: params.season,
      pv_percentage: params.pv_percentage,
      sd_percentage: params.sd_percentage,
      with_battery: params.with_battery
    };

    console.log('Sending params:', submissionParams);

    try {
      const response = await fetch('http://localhost:8000/api/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submissionParams)
      });

      const responseText = await response.text();

      if (!response.ok) {
        const errorMessage = responseText ? JSON.parse(responseText).detail : 'Simulation failed';
        throw new Error(errorMessage);
      }

      try {
        const data = JSON.parse(responseText);
        console.log('Parsed response:', data);
        if (!data.cost_metrics || !data.energy_metrics || !data.market_metrics) {
          throw new Error('Invalid response format');
        }
        setResults(prev => [...prev, data]);
        // check if there is more than one result
        if (results.length > 0) {
          setSelectedResultIndex(results.length);
        }
      } catch (parseError) {
        console.error('Parse error:', parseError);
        setError('Failed to parse server response');
      }
    } catch (error) {
      console.error('Error:', error);
      setError(error instanceof Error ? error.message : 'An error occurred');
    }
  };

  const formatNumber = (num: number, decimals: number = 2): string => {
    const parts = num.toFixed(decimals).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, "'");
    return parts.join('.');
  };

  const getCircularPath = (percentage: number) => {
    const radius = 36;  // Radius for the path
    const center = 40;  // Center point
    const startAngle = -Math.PI / 2;  // Start from top
    const angle = startAngle + (percentage / 100) * 2 * Math.PI;
    const x = center + radius * Math.cos(angle);
    const y = center + radius * Math.sin(angle);
    return `M${center},${center - radius} A${radius},${radius} 0 ${percentage > 50 ? 1 : 0},1 ${x},${y}`;
  };

  /* Helper function to calculate circular fill */
  const getCircularFillPath = (percentage: number) => {
    const angle = (percentage / 100) * 2 * Math.PI;
    const radius = 40;  // Half of circle width
    const x = radius + radius * Math.cos(angle - Math.PI / 2);
    const y = radius + radius * Math.sin(angle - Math.PI / 2);
    return `M${radius},${radius} L${radius},0 A${radius},${radius} 0 ${percentage > 50 ? 1 : 0},1 ${x},${y} Z`;
  };

  const getThumbPosition = (percentage: number) => {
    const radius = 36;  // Same radius as the path
    const angle = (percentage / 100) * 2 * Math.PI - Math.PI / 2;  // Start from top
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    return `translate(${x}px, ${y}px)`;
  };

  return (
    <div className="container-flex">
      <div className="containerSelect">

        <div className="containerTitle">
          <h2>Local Energy Community Simulation</h2>
          <p>{descLEC}</p>
        </div>
        {error && (
          <div className="error">
            Error: {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group" title={descSize}>
            <label>Size</label>
            <div className="size-slider" style={{
              '--clip-percent': `${100 - ((params.community_size - 5) / 95) * 100}%`
            } as React.CSSProperties}>
              <input
                type="range"
                name="community_size"
                min="5"
                max="100"
                value={params.community_size}
                onChange={handleSliderChange}
              />
              <span>{params.community_size}</span>
            </div>
          </div>

          <div className="form-group" title={descSeason}>
            <label>Season</label>
            <div className="season-buttons">
              {['sum', 'win', 'aut', 'spr'].map((season) => (
                <button
                  type="button"
                  key={season}
                  className={params.season === season ? 'active' : ''}
                  onClick={() => handleButtonClick('season', season)}
                >
                  {SEASON_SYMBOLS[season]}
                </button>
              ))}
            </div>
          </div>

          <div className="circles-row">
            <div className="circle-container" title={descSD}>
              <label>Smart Devices</label>
              <div className="circle" onMouseDown={(e) => handleCircleSliderChange(e, 'sd_percentage')}>
                <svg className="circle-fill" viewBox="0 0 80 80">
                  <path d={getCircularPath(params.sd_percentage)} />
                </svg>
                <span>{params.sd_percentage}%</span>
              </div>
            </div>

            <div className="circle-container" title={descPV}>
              <label>Have PV</label>
              <div className="circle" onMouseDown={(e) => handleCircleSliderChange(e, 'pv_percentage')}>
                <svg className="circle-fill" viewBox="0 0 80 80">
                  <path d={getCircularPath(params.pv_percentage)} />
                </svg>
                <span>{params.pv_percentage}%</span>
              </div>
            </div>
          </div>

          <div className="button-group" title={descBattery}>
            <button
              type="button"
              className={`battery-button ${params.with_battery ? 'active' : ''}`}
              onClick={() => handleButtonClick('with_battery', !params.with_battery)}
            >
              <BatteryIcon />
              {params.with_battery ? 'Yes' : 'No'}
            </button>
            <button type="submit" title={descConfirm}>Confirm</button>
          </div>
        </form>
      </div>
      {results.length > 0 && (
        <div className="containerResults">

          <div style={{ marginBottom: '1em' }}>
            <label htmlFor="resultSelect">Choose a Simulation Result:</label>
            <select
              id="resultSelect"
              value={selectedResultIndex}
              onChange={(e) => setSelectedResultIndex(Number(e.target.value))}
              style={{ marginLeft: '0.5em' }}
            >
              {results.map((_, i) => (
                <option key={i} value={i}>
                  {`Result #${i + 1}`}
                </option>
              ))}
            </select>
          </div>
          <div key={selectedResultIndex} className="results">
            <h2>Results #{selectedResultIndex + 1}</h2>
            {/* 
            <h3>Possible Trading Network</h3>
            <TradingNetworkForceGraph tradingNetwork={results[selectedResultIndex].trading_network} /> */}


            <h3>Cost Metrics</h3>
            <CostComparison
              withLec={results[selectedResultIndex].cost_metrics.cost_with_lec}
              withoutLec={results[selectedResultIndex].cost_metrics.cost_without_lec}
            />

            <h3>Energy Metrics</h3>
            <p><span>Total Production:</span> <span>{formatNumber(results[selectedResultIndex].energy_metrics.total_production)} kWh</span></p>
            <p><span>Total Consumption:</span> <span>{formatNumber(results[selectedResultIndex].energy_metrics.total_consumption)} kWh</span></p>
            <p><span>Grid Import:</span> <span>{formatNumber(results[selectedResultIndex].energy_metrics.total_grid_import)} kWh</span></p>
            <p><span>Grid Export:</span> <span>{formatNumber(results[selectedResultIndex].energy_metrics.total_grid_export)} kWh</span></p>

            <h3>Market Metrics</h3>
            <p><span>Trading Volume:</span> <span>{formatNumber(results[selectedResultIndex].market_metrics.trading_volume)} kWh</span></p>
            <p><span>Demand Fulfillment:</span> <span>{formatNumber(results[selectedResultIndex].market_metrics.ratio_fulfilled_demand * 100)}%</span></p>
            <p><span>Supply Sold:</span> <span>{formatNumber(results[selectedResultIndex].market_metrics.ratio_sold_supply * 100)}%</span></p>
            <p><span>Consumption from Grid:</span> <span>{(100 * results[selectedResultIndex].energy_metrics.total_grid_import / results[selectedResultIndex].energy_metrics.total_consumption).toFixed(1)} %</span></p>
            <p><span>Production to Grid:</span> <span>{(100 * results[selectedResultIndex].energy_metrics.total_grid_export / results[selectedResultIndex].energy_metrics.total_production).toFixed(1)} %</span></p>

            {results[selectedResultIndex].warnings.length > 0 && (
              <>
                <h3>Warnings</h3>
                <ul>
                  {results[selectedResultIndex].warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </>
            )}

            {results[selectedResultIndex].errors.length > 0 && (
              <>
                <h3>Errors</h3>
                <ul>
                  {results[selectedResultIndex].errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </>
            )}

            {/* <h3>Load and Generation Profile</h3>
            <LoadGenProfile loadProfile={results[selectedResultIndex].profiles.load_profile} genProfile={results[selectedResultIndex].profiles.gen_profile} />
          */}
          </div>

        </div>
      )}
      {results.length > 0 && (
        <div className="containerGraph">
          <h2>Trading Network Graph</h2>
          <p>Hover the nodes and links to see more details.</p>
          <TradingNetworkForceGraph tradingNetwork={results[selectedResultIndex]?.trading_network} width={400} height={400} />
          <h2>Load and Generation Profile</h2>
          <p>Hover the lines to see more details.</p>
          <LoadGenProfile loadProfile={results[selectedResultIndex]?.profiles.load_profile} genProfile={results[selectedResultIndex]?.profiles.gen_profile} />
        </div>
      )}
    </div>
  );
}

export default App;
