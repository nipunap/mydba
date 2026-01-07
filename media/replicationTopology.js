// Replication Topology Visualization using D3.js
// Card-based layout showing host details
// Version 2.6 - Ultra compact cards with zoom/pan

// Use VS Code API if already provided by the host; do not call acquireVsCodeApi here
let vscodeApi = undefined;
try {
    const anyWindow = /** @type {any} */ (window);
    vscodeApi = anyWindow.__mydbaVscodeApi;
} catch (err) {
    console.warn('[ReplicationTopology] Unable to read VS Code API from window', err);
}

let currentData = null;
let simulation = null;

// Card dimensions - adjust these to resize all cards
const CARD_WIDTH = 190;
const CARD_HEIGHT = 70;
const CARD_PADDING_X = CARD_WIDTH / 2 + 10; // Half width + margin
const CARD_PADDING_Y = CARD_HEIGHT / 2 + 10; // Half height + margin

console.log('[ReplicationTopology] Script loaded - Version 2.6 ultra compact');
console.log('[ReplicationTopology] Card dimensions:', { CARD_WIDTH, CARD_HEIGHT });

// Initialize topology on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    // Empty initially - will be populated when data arrives
});

/**
 * Render the replication topology using D3.js force-directed graph with cards
 */
function renderTopology(data) {
    const { role, masterStatus, connectedReplicas, replicaStatus } = data;
    currentData = data;

    // Clear existing visualization
    const container = document.getElementById('topology');
    container.innerHTML = '';

    console.log('[ReplicationTopology] Rendering with card dimensions:', { CARD_WIDTH, CARD_HEIGHT, CARD_PADDING_X, CARD_PADDING_Y });

    // If standalone, show message
    if (role === 'standalone') {
        container.innerHTML = '<div style="text-align: center; padding: 48px; opacity: 0.7;">No replication configured</div>';
        return;
    }

    // Build nodes and links
    const nodes = [];
    const links = [];

    // Add current server node
    const currentServerId = masterStatus ? 1 : (replicaStatus ? 999 : 0);
    const currentNode = {
        id: `server-${currentServerId}`,
        serverId: currentServerId,
        host: 'Current Server',
        port: 0,
        role: role === 'master' || role === 'both' ? 'master' : 'replica',
        readOnly: role === 'replica',
        lag: replicaStatus ? replicaStatus.lagSeconds : null,
        binlogFile: masterStatus ? masterStatus.file : (replicaStatus ? replicaStatus.binlogPosition?.masterLogFile : null),
        binlogPos: masterStatus ? masterStatus.position : (replicaStatus ? replicaStatus.binlogPosition?.masterLogPos : null),
        isCurrent: true
    };
    nodes.push(currentNode);

    // Add connected replicas as nodes (if current server is master)
    if (connectedReplicas && connectedReplicas.length > 0) {
        connectedReplicas.forEach(replica => {
            nodes.push({
                id: `server-${replica.serverId}`,
                serverId: replica.serverId,
                host: replica.host || '(unknown)',
                port: replica.port,
                role: 'replica',
                readOnly: true,
                lag: replica.secondsBehindMaster,
                uuid: replica.replicaUuid,
                binlogFile: replica.masterLogFile,
                binlogPos: replica.readMasterLogPos,
                isCurrent: false
            });

            // Add link from master to replica
            links.push({
                source: currentNode.id,
                target: `server-${replica.serverId}`,
                type: 'replication'
            });
        });
    }

    // If current server is a replica, add master node
    if (replicaStatus) {
        const masterNode = {
            id: 'server-master',
            serverId: 0,
            host: replicaStatus.masterHost,
            port: replicaStatus.masterPort,
            role: 'master',
            readOnly: false,
            lag: null,
            isCurrent: false
        };
        nodes.push(masterNode);

        // Add link from master to current server
        links.push({
            source: masterNode.id,
            target: currentNode.id,
            type: 'replication'
        });
    }

    // If no nodes to show (should not happen), show a helpful message
    if (nodes.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding: 48px; opacity: 0.7;">No replication data available.</div>';
        return;
    }

    // Set up SVG
    const width = container.clientWidth;
    const height = 500;

    console.log('[ReplicationTopology] SVG dimensions:', { width, height, CARD_PADDING_X, CARD_PADDING_Y });
    console.log('[ReplicationTopology] Calculated bounds:', {
        minX: CARD_PADDING_X,
        maxX: width - CARD_PADDING_X,
        minY: CARD_PADDING_Y,
        maxY: height - CARD_PADDING_Y
    });

    const svg = d3.select('#topology')
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', [0, 0, width, height])
        .attr('style', 'max-width: 100%; height: auto; cursor: move;');

    // Add zoom controls container
    const controlsHtml = `
        <div style="position: absolute; top: 10px; right: 10px; display: flex; flex-direction: column; gap: 4px; z-index: 1000;">
            <button id="zoom-in" style="width: 32px; height: 32px; border: 1px solid var(--vscode-button-border); background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-radius: 4px; cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center;" title="Zoom In">+</button>
            <button id="zoom-out" style="width: 32px; height: 32px; border: 1px solid var(--vscode-button-border); background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-radius: 4px; cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center;" title="Zoom Out">−</button>
            <button id="zoom-reset" style="width: 32px; height: 32px; border: 1px solid var(--vscode-button-border); background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-radius: 4px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center;" title="Reset Zoom">⊙</button>
        </div>
    `;
    container.insertAdjacentHTML('afterbegin', controlsHtml);

    // Create a group for zoom/pan
    const g = svg.append('g');

    // Set up zoom behavior
    const zoom = d3.zoom()
        .scaleExtent([0.5, 3]) // Min 50%, max 300% zoom
        .on('zoom', (event) => {
            g.attr('transform', event.transform);
        });

    svg.call(zoom);

    // Zoom control buttons
    document.getElementById('zoom-in').onclick = () => {
        svg.transition().duration(300).call(zoom.scaleBy, 1.3);
    };
    document.getElementById('zoom-out').onclick = () => {
        svg.transition().duration(300).call(zoom.scaleBy, 0.7);
    };
    document.getElementById('zoom-reset').onclick = () => {
        svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);
    };

    // Add arrow marker for links
    g.append('defs').append('marker')
        .attr('id', 'arrowhead')
        .attr('viewBox', '-0 -5 10 10')
        .attr('refX', 9) // Arrow tip position (line already ends at card edge)
        .attr('refY', 0)
        .attr('orient', 'auto')
        .attr('markerWidth', 8)
        .attr('markerHeight', 8)
        .append('svg:path')
        .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
        .attr('fill', '#999')
        .style('stroke', 'none');

    // Create force simulation with horizontal layout
    simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(d => d.id).distance(210).strength(0.6))
        .force('charge', d3.forceManyBody().strength(-80))
        .force('collision', d3.forceCollide().radius(Math.max(CARD_WIDTH, CARD_HEIGHT) / 2 + 10))
        .force('x', d3.forceX(d => {
            // Position master nodes on the left, replicas on the right
            const targetX = d.role === 'master' ? width * 0.25 : width * 0.75;
            console.log(`[ReplicationTopology] Target X for ${d.id} (${d.role}): ${targetX}`);
            return targetX;
        }).strength(0.8))
        .force('y', d3.forceY(d => {
            // Spread replicas vertically if there are multiple
            const replicas = nodes.filter(n => n.role === 'replica');
            if (d.role === 'replica' && replicas.length > 1) {
                const index = replicas.indexOf(d);
                return height * (0.3 + (index * 0.4 / Math.max(1, replicas.length - 1)));
            }
            return height / 2;
        }).strength(0.3))
        .alphaDecay(0.02); // Slower cooling for gentler movement

    // Create links
    const link = g.append('g')
        .attr('stroke', '#999')
        .attr('stroke-opacity', 0.3)
        .attr('stroke-dasharray', '5,5')
        .selectAll('line')
        .data(links)
        .join('line')
        .attr('stroke-width', 2)
        .attr('marker-end', 'url(#arrowhead)');

    // Create node groups
    const node = g.append('g')
        .selectAll('g')
        .data(nodes)
        .join('g')
        .call(drag(simulation));

    // Add card background using foreignObject for HTML rendering
    const foreignObj = node.append('foreignObject')
        .attr('x', -CARD_WIDTH / 2)
        .attr('y', -CARD_HEIGHT / 2)
        .attr('width', CARD_WIDTH)
        .attr('height', CARD_HEIGHT);

    console.log('[ReplicationTopology] Created foreignObject with dimensions:', {
        x: -CARD_WIDTH / 2,
        y: -CARD_HEIGHT / 2,
        width: CARD_WIDTH,
        height: CARD_HEIGHT
    });

    foreignObj.append('xhtml:div')
        .style('width', `${CARD_WIDTH}px`)
        .style('height', `${CARD_HEIGHT}px`)
        .style('background', 'var(--vscode-editor-background)')
        .style('border', d => {
            if (d.role === 'master') return '2px solid #2196f3'; // Blue for master
            if (d.lag !== null && d.lag > 10) return '2px solid #f44336'; // Red for high lag
            if (d.lag !== null && d.lag > 5) return '2px solid #ff9800'; // Orange for medium lag
            return '2px solid #4caf50'; // Green for healthy replica
        })
        .style('border-radius', '5px')
        .style('padding', '2px 3px')
        .style('font-family', 'var(--vscode-font-family)')
        .style('font-size', '10px')
        .style('color', 'var(--vscode-editor-foreground)')
        .style('box-shadow', 'inset 0 0 0 1px var(--vscode-panel-border), 0 2px 8px rgba(0,0,0,0.25)')
        .html(d => {
            const roleLabel = d.role === 'master' ? '📤 Master' : '📥 Replica';
            const hasLag = d.lag !== null && d.lag !== undefined && !isNaN(d.lag);
            const lagColor = hasLag ? (d.lag > 10 ? '#f44336' : (d.lag > 5 ? '#ff9800' : '#4caf50')) : '';
            const roStatus = d.readOnly ? '🔒 RO' : '✏️ RW';
            const hostDisplay = d.isCurrent ? '<strong>Current Server</strong>' : `${d.host}:${d.port}`;
            const serverIdText = d.serverId && d.serverId !== 999 ? `ID ${d.serverId}` : '';
            const posText = d.binlogPos ? `@ ${d.binlogPos}` : 'N/A';

            return `
                <div style="display: flex; flex-direction: column; height: 100%; padding: 1px 2px;">
                    <!-- Header -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                        <div style="font-weight: 700; font-size: 9px; color: ${d.role === 'master' ? '#2196f3' : '#4caf50'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${roleLabel}
                        </div>
                        ${hasLag ? `
                            <div style="background: ${lagColor}; color: white; padding: 1px 5px; border-radius: 8px; font-size: 8px; font-weight: bold; min-width: 30px; text-align: center;">
                                ${d.lag}s
                            </div>
                        ` : '<div style="width:30px;"></div>'}
                    </div>

                    <!-- Host + ID -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px; font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        <span style="font-weight: 700;">${hostDisplay}</span>
                        <span style="opacity: 0.7; margin-left: 6px;">${serverIdText}</span>
                    </div>

                    <!-- Position + RO + Info -->
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 8.5px; border-top: 1px solid var(--vscode-panel-border); padding-top: 2px; margin-top: 2px;">
                        <span style="opacity: 0.8;">Pos: ${posText}</span>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-weight: 600;">${roStatus}</span>
                            <div class="node-icon" data-node-id="${d.id}" style="cursor: pointer; font-size: 11px; padding: 0 2px;" title="View worker details">ℹ️</div>
                        </div>
                    </div>
                </div>
            `;
        });


    // Add click handler for info icons
    svg.selectAll('.node-icon').on('click', function(event) {
        event.stopPropagation();
        const nodeId = d3.select(this).attr('data-node-id');
        const nodeData = nodes.find(n => n.id === nodeId);
        if (nodeData) {
            showWorkerDetails(nodeData);
        }
    });

    // Update positions on tick
    let tickCount = 0;
    simulation.on('tick', () => {
        // Constrain nodes to viewport using dynamic card dimensions BEFORE rendering
        nodes.forEach(d => {
            const oldX = d.x;
            const oldY = d.y;
            d.x = Math.max(CARD_PADDING_X, Math.min(width - CARD_PADDING_X, d.x));
            d.y = Math.max(CARD_PADDING_Y, Math.min(height - CARD_PADDING_Y, d.y));

            if (tickCount < 3 && (oldX !== d.x || oldY !== d.y)) {
                console.log(`[ReplicationTopology] Clamped ${d.id}: (${oldX.toFixed(1)}, ${oldY.toFixed(1)}) -> (${d.x.toFixed(1)}, ${d.y.toFixed(1)})`);
            }
        });

        // Log first few ticks for debugging
        if (tickCount < 3) {
            console.log(`[ReplicationTopology] Tick ${tickCount}: node positions`, nodes.map(n => ({ id: n.id, x: Math.round(n.x), y: Math.round(n.y) })));
            tickCount++;
        }

        link
            .attr('x1', d => {
                // Calculate edge point on source card (right edge for horizontal layout)
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                const angle = Math.atan2(dy, dx);
                return d.source.x + Math.cos(angle) * (CARD_WIDTH / 2);
            })
            .attr('y1', d => {
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                const angle = Math.atan2(dy, dx);
                return d.source.y + Math.sin(angle) * (CARD_HEIGHT / 2);
            })
            .attr('x2', d => {
                // Calculate edge point on target card (left edge for horizontal layout)
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                const angle = Math.atan2(dy, dx);
                return d.target.x - Math.cos(angle) * (CARD_WIDTH / 2);
            })
            .attr('y2', d => {
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                const angle = Math.atan2(dy, dx);
                return d.target.y - Math.sin(angle) * (CARD_HEIGHT / 2);
            });

        node.attr('transform', d => `translate(${d.x},${d.y})`);
    });
}

/**
 * Drag behavior for nodes
 */
function drag(simulation) {
    function dragstarted(event) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
    }

    function dragged(event) {
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
    }

    function dragended(event) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
    }

    return d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended);
}

/**
 * Show worker details modal for a node
 */
function showWorkerDetails(node) {
    // Request worker data from extension
    vscode.postMessage({ command: 'getWorkers' });

    // Show loading modal
    const modal = document.getElementById('worker-modal');
    const modalContent = document.getElementById('worker-modal-content');
    const displayName = node.isCurrent ? 'Current Server' : `${node.host}:${node.port}`;
    modalContent.innerHTML = `
        <div style="text-align: center; padding: 24px;">
            <h3 style="margin-top: 0;">Worker Details - ${displayName}</h3>
            <p>Loading worker details...</p>
        </div>
    `;
    modal.style.display = 'flex';
}

/**
 * Render worker details in modal
 */
function renderWorkerDetails(workers) {
    const modalContent = document.getElementById('worker-modal-content');

    if (!workers || workers.length === 0) {
        modalContent.innerHTML = `
            <div style="text-align: center; padding: 24px;">
                <p>No replication workers found.</p>
                <p style="font-size: 12px; opacity: 0.7; margin-top: 12px;">
                    This might mean:<br>
                    • This server is not a replica<br>
                    • Parallel replication is not enabled<br>
                    • performance_schema is not enabled
                </p>
            </div>
        `;
        return;
    }

    let html = `
        <h3 style="margin-top: 0;">Replication Workers (${workers.length})</h3>
        <div style="max-height: 400px; overflow-y: auto;">
    `;

    workers.forEach(worker => {
        const stateColor = worker.serviceState === 'ON' ? '#4caf50' : '#f44336';
        const hasError = worker.lastErrorNumber > 0;

        html += `
            <div style="border: 1px solid var(--vscode-panel-border); padding: 12px; margin: 8px 0; border-radius: 4px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <strong>Worker #${worker.workerId}</strong>
                    <span style="color: ${stateColor}; font-size: 12px;">● ${worker.serviceState}</span>
                </div>
                ${worker.channelName ? `<div style="font-size: 11px; opacity: 0.8;">Channel: ${worker.channelName}</div>` : ''}
                ${worker.threadId ? `<div style="font-size: 11px; opacity: 0.8;">Thread ID: ${worker.threadId}</div>` : ''}
                ${worker.lastAppliedTransaction ? `
                    <div style="font-size: 11px; opacity: 0.8; margin-top: 8px;">
                        Last Applied: <code style="font-size: 10px;">${worker.lastAppliedTransaction.substring(0, 40)}...</code>
                    </div>
                ` : ''}
                ${worker.applyingTransaction ? `
                    <div style="font-size: 11px; opacity: 0.8;">
                        Currently Applying: <code style="font-size: 10px;">${worker.applyingTransaction.substring(0, 40)}...</code>
                    </div>
                ` : ''}
                ${hasError ? `
                    <div style="background: #f443361a; padding: 8px; margin-top: 8px; border-radius: 3px;">
                        <div style="color: #f44336; font-size: 12px; font-weight: bold;">Error ${worker.lastErrorNumber}</div>
                        <div style="font-size: 11px; margin-top: 4px;">${worker.lastErrorMessage}</div>
                    </div>
                ` : ''}
            </div>
        `;
    });

    html += '</div>';
    modalContent.innerHTML = html;
}

/**
 * Close worker details modal
 */
function closeWorkerModal() {
    const modal = document.getElementById('worker-modal');
    modal.style.display = 'none';
}
